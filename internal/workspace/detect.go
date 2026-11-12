package workspace

import (
	"bytes"
	"context"
	"crypto/sha256"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"

	"gitview/internal/git"
	"gitview/internal/repo"
	"gitview/internal/repo/query"
)

// detection configures how changes made outside gitview are noticed.
type detection struct {
	// watchFiles enables file system notifications for the git directory.
	watchFiles bool
	// settle is how long notifications must stop before the repository is
	// inspected, so one git command is reported once.
	settle time.Duration
	// poll is the interval of the fallback inspection, which catches changes
	// whose notifications were lost.
	poll time.Duration
}

var defaultDetection = detection{watchFiles: true, settle: 100 * time.Millisecond, poll: 5 * time.Second}

// snapshotTimeout bounds one inspection of the repository.
const snapshotTimeout = 10 * time.Second

// snapshot is what change detection compares. The working tree is not part
// of it: watching every file would exhaust system watch limits on large
// repositories, so clients poll status instead.
type snapshot struct {
	refs  [sha256.Size]byte
	index indexStamp
	state query.State
}

type indexStamp struct {
	exists  bool
	size    int64
	modTime time.Time
}

// takeSnapshot inspects HEAD, every ref with its upstream (a branch's
// tracking is part of the refs area, though git keeps it in config), the
// index file and in-progress state files.
func takeSnapshot(ctx context.Context, r *repo.Repository) (snapshot, error) {
	head, err := os.ReadFile(filepath.Join(r.GitDir, "HEAD"))
	if err != nil {
		return snapshot{}, err
	}
	refs, err := r.Runner.Run(ctx, git.Read("for-each-ref", "--format=%(objectname) %(refname) %(upstream)"))
	if err != nil {
		return snapshot{}, err
	}
	snap := snapshot{
		refs:  sha256.Sum256(bytes.Join([][]byte{head, refs.Stdout}, []byte{0})),
		state: query.InProgressState(r.GitDir),
	}
	if info, err := os.Stat(filepath.Join(r.GitDir, "index")); err == nil {
		snap.index = indexStamp{exists: true, size: info.Size(), modTime: info.ModTime()}
	}
	return snap, nil
}

// areas lists the areas that differ between two snapshots, plus also, in
// a fixed order.
func (s snapshot) areas(next snapshot, also ...Area) []Area {
	differs := map[Area]bool{
		AreaRefs:  s.refs != next.refs,
		AreaIndex: s.index != next.index,
		AreaState: s.state != next.state,
	}
	for _, area := range also {
		differs[area] = true
	}
	changed := []Area{}
	for _, area := range []Area{AreaRefs, AreaIndex, AreaWorktree, AreaState} {
		if differs[area] {
			changed = append(changed, area)
		}
	}
	return changed
}

// changeDetector notices when a repository changes and publishes
// RepoChanged. It is paused while gitview itself writes, so intermediate
// states are never reported, and reports the write once when it finishes.
type changeDetector struct {
	id      string
	repo    *repo.Repository
	publish func(Event)

	mu      sync.Mutex
	writing bool
	last    snapshot
	version uint64

	stop context.CancelFunc
	done chan struct{}
}

// startDetector takes the snapshot later changes are compared with, then
// watches the repository in the background until close.
func startDetector(ctx context.Context, id string, r *repo.Repository, config detection, publish func(Event)) (*changeDetector, error) {
	initial, err := takeSnapshot(ctx, r)
	if err != nil {
		return nil, err
	}
	var watcher *fsnotify.Watcher
	if config.watchFiles {
		// Without notifications, the fallback poll still notices changes.
		watcher, _ = watchGitDir(r.GitDir)
	}
	loopCtx, stop := context.WithCancel(context.Background())
	d := &changeDetector{id: id, repo: r, publish: publish, last: initial, stop: stop, done: make(chan struct{})}
	go d.run(loopCtx, watcher, config)
	return d, nil
}

func (d *changeDetector) run(ctx context.Context, watcher *fsnotify.Watcher, config detection) {
	defer close(d.done)
	var notifications <-chan fsnotify.Event
	var failures <-chan error
	if watcher != nil {
		defer func() { _ = watcher.Close() }()
		notifications, failures = watcher.Events, watcher.Errors
	}
	refs := filepath.Join(commonDir(d.repo.GitDir), "refs")
	poll := time.NewTicker(config.poll)
	defer poll.Stop()
	settled := time.NewTimer(config.settle)
	settled.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-notifications:
			if !ok {
				notifications = nil
				continue
			}
			if event.Has(fsnotify.Create) && isWithin(event.Name, refs) {
				watchDirs(watcher, event.Name)
			}
			settled.Reset(config.settle)
		case _, ok := <-failures:
			if !ok {
				failures = nil
				continue
			}
			// Notifications may have been lost (e.g. queue overflow).
			settled.Reset(config.settle)
		case <-settled.C:
			d.check(ctx)
		case <-poll.C:
			d.check(ctx)
		}
	}
}

// check reports changes since the last snapshot, unless a write is running.
func (d *changeDetector) check(ctx context.Context) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if !d.writing {
		d.report(ctx)
	}
}

// pause stops reporting until resume; a check already running finishes
// first.
func (d *changeDetector) pause() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.writing = true
}

// resume reports everything a write changed in one event. The working tree
// is always included, because writes may change files and it is not part of
// the snapshot.
func (d *changeDetector) resume() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.writing = false
	d.report(context.Background(), AreaWorktree)
}

// report must be called with mu held.
func (d *changeDetector) report(ctx context.Context, also ...Area) {
	ctx, cancel := context.WithTimeout(ctx, snapshotTimeout)
	defer cancel()
	next, err := takeSnapshot(ctx, d.repo)
	if err != nil {
		// The repository may be mid-change; the next check tries again.
		next = d.last
	}
	changed := d.last.areas(next, also...)
	d.last = next
	if len(changed) == 0 {
		return
	}
	d.version++
	d.publish(RepoChanged{RepoID: d.id, Version: d.version, Changed: changed})
}

func (d *changeDetector) close() {
	d.stop()
	<-d.done
}

// watchGitDir watches the files git changes when refs, the index or
// in-progress state change: the git directory itself (HEAD, index,
// packed-refs, MERGE_HEAD, rebase-merge/, ...) and every directory under
// refs/. A linked worktree keeps refs in the common git directory.
func watchGitDir(gitDir string) (*fsnotify.Watcher, error) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	common := commonDir(gitDir)
	dirs := []string{gitDir}
	if common != gitDir {
		dirs = append(dirs, common)
	}
	for _, dir := range dirs {
		if err := watcher.Add(dir); err != nil {
			_ = watcher.Close()
			return nil, err
		}
	}
	watchDirs(watcher, filepath.Join(common, "refs"))
	return watcher, nil
}

// watchDirs watches path and every directory below it, e.g. refs/ when
// watching starts and refs/heads/feature/ after "git branch feature/login".
func watchDirs(watcher *fsnotify.Watcher, path string) {
	_ = filepath.WalkDir(path, func(dir string, entry fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() {
			_ = watcher.Add(dir)
		}
		return nil
	})
}

func isWithin(path, dir string) bool {
	return strings.HasPrefix(path, dir+string(filepath.Separator))
}

// commonDir is the git directory shared by all worktrees: gitDir itself, or
// the directory its "commondir" file points to in a linked worktree.
func commonDir(gitDir string) string {
	data, err := os.ReadFile(filepath.Join(gitDir, "commondir"))
	if err != nil {
		return gitDir
	}
	dir := strings.TrimSpace(string(data))
	if !filepath.IsAbs(dir) {
		dir = filepath.Join(gitDir, dir)
	}
	return filepath.Clean(dir)
}
