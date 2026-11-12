package workspace

import (
	"context"
	"sync"
	"time"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// writeTimeout bounds one write operation. It is generous because commit
// hooks may run linters or tests.
const writeTimeout = 10 * time.Minute

// commandLogSize is how many write commands each repository remembers.
const commandLogSize = 200

// WriteFunc changes a repository. It must run every git command through the
// Repository it is given, so the commands are serialized, retried on
// index.lock conflicts and recorded in the command log.
type WriteFunc func(ctx context.Context, r *repo.Repository) error

// Write runs op while holding the repository's write lock, so writes to one
// repository never overlap; reads do not take the lock and are never blocked
// by it.
//
// Write waits for the lock only as long as ctx allows. Once op starts it runs
// to completion even if ctx is canceled (up to writeTimeout), so a client
// that goes away cannot leave the repository half-changed.
//
// It returns the write commands op ran, in order, including a failed last
// command; they are also appended to the repository's command log.
func (r *Repo) Write(ctx context.Context, op WriteFunc) ([]git.LogEntry, error) {
	if err := r.lock(ctx); err != nil {
		return nil, err
	}
	defer r.unlock()
	writeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), writeTimeout)
	defer cancel()
	return r.write(writeCtx, op, nil)
}

// lock takes the write lock, waiting only as long as ctx allows.
func (r *Repo) lock(ctx context.Context) error {
	select {
	case r.writeLock <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (r *Repo) unlock() { <-r.writeLock }

// write runs op; the caller holds the write lock. Change detection is
// paused meanwhile and every write command is recorded in the command log.
// wrap, when not nil, adds to the runner op uses (a job reports progress
// through it).
func (r *Repo) write(ctx context.Context, op WriteFunc, wrap func(git.Runner) git.Runner) ([]git.LogEntry, error) {
	r.beginWrite()
	defer r.endWrite()

	var mu sync.Mutex
	var commands []git.LogEntry
	runner := git.Recording(git.RetryOnLock(r.repository.Runner, git.LockRetryDelays), func(entry git.LogEntry) {
		r.commands.Add(entry)
		mu.Lock()
		commands = append(commands, entry)
		mu.Unlock()
	})
	if wrap != nil {
		runner = wrap(runner)
	}
	err := op(ctx, &repo.Repository{Root: r.repository.Root, GitDir: r.repository.GitDir, Runner: runner})

	mu.Lock()
	defer mu.Unlock()
	return append([]git.LogEntry{}, commands...), err
}

// beginWrite runs after the write lock is taken, before the operation's
// first command. It pauses change detection, so gitview's own intermediate
// states are not reported as outside changes.
func (r *Repo) beginWrite() { r.changes.pause() }

// endWrite runs after the operation, while the write lock is still held. It
// resumes change detection and reports what the write changed in one event.
func (r *Repo) endWrite() { r.changes.resume() }

// Commands returns the repository's recent write commands, oldest first.
func (r *Repo) Commands() []git.LogEntry { return r.commands.Entries() }
