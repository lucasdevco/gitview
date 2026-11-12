// Package workspace holds the repositories gitview has open. Each open
// repository has a stable ID used in API paths (/api/v1/repos/{repoId}/...).
// Per-repository resources — the write lock, change watcher, version number
// and background jobs — belong on Repo.
package workspace

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"sync"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// Repo is an open repository in the workspace.
type Repo struct {
	// ID is derived from the repository root, so it is URL-safe and stays the
	// same across restarts.
	ID string
	*repo.Repository

	// writeLock holds one token while a write runs; see Write.
	writeLock chan struct{}
	commands  *git.CommandLog
	changes   *changeDetector
	jobs      jobList
	publish   func(Event)
}

// Workspace is the set of open repositories. It is safe for concurrent use.
// Close it to stop watching the repositories and end event subscriptions.
type Workspace struct {
	mu        sync.RWMutex
	repos     []*Repo
	events    *eventHub
	detection detection
}

// New returns an empty workspace.
func New() *Workspace { return newWorkspace(defaultDetection) }

func newWorkspace(config detection) *Workspace {
	return &Workspace{events: newEventHub(), detection: config}
}

// Open opens the repository containing path, or returns it if it is already
// open. From then on, changes to the repository — by gitview or anything
// else — are published as RepoChanged events.
func (w *Workspace) Open(ctx context.Context, path string) (*Repo, error) {
	opened, err := repo.Open(ctx, path)
	if err != nil {
		return nil, err
	}
	id := repoID(opened.Root)
	if existing, ok := w.Repo(id); ok {
		return existing, nil
	}
	changes, err := startDetector(ctx, id, opened, w.detection, w.Publish)
	if err != nil {
		return nil, err
	}
	added := &Repo{ID: id, Repository: opened, writeLock: make(chan struct{}, 1), commands: git.NewCommandLog(commandLogSize), changes: changes, publish: w.Publish}

	w.mu.Lock()
	defer w.mu.Unlock()
	for _, existing := range w.repos {
		if existing.ID == id {
			changes.close()
			return existing, nil
		}
	}
	w.repos = append(w.repos, added)
	return added, nil
}

// Subscribe starts receiving the workspace's events. Close the subscription
// when done.
func (w *Workspace) Subscribe() *Subscription { return w.events.subscribe() }

// Publish sends event to every current subscriber. It never blocks.
func (w *Workspace) Publish(event Event) { w.events.publish(event) }

// Close cancels every job, stops watching every repository and ends all
// subscriptions. Writes still work afterwards but are no longer reported.
func (w *Workspace) Close() {
	for _, r := range w.Repos() {
		r.stopJobs()
		r.changes.close()
	}
	w.events.close()
}

// Repo returns the open repository with id.
func (w *Workspace) Repo(id string) (*Repo, bool) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	for _, r := range w.repos {
		if r.ID == id {
			return r, true
		}
	}
	return nil, false
}

// Repos lists open repositories in the order they were opened.
func (w *Workspace) Repos() []*Repo {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return append([]*Repo(nil), w.repos...)
}

func repoID(root string) string {
	sum := sha256.Sum256([]byte(root))
	return hex.EncodeToString(sum[:6])
}
