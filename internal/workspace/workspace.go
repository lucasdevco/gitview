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

	"gitview/internal/repo"
)

// Repo is an open repository in the workspace.
type Repo struct {
	// ID is derived from the repository root, so it is URL-safe and stays the
	// same across restarts.
	ID string
	*repo.Repository
}

// Workspace is the set of open repositories. It is safe for concurrent use.
type Workspace struct {
	mu    sync.RWMutex
	repos []*Repo
}

// New returns an empty workspace.
func New() *Workspace { return &Workspace{} }

// Open opens the repository containing path, or returns it if it is already
// open.
func (w *Workspace) Open(ctx context.Context, path string) (*Repo, error) {
	opened, err := repo.Open(ctx, path)
	if err != nil {
		return nil, err
	}
	id := repoID(opened.Root)
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, existing := range w.repos {
		if existing.ID == id {
			return existing, nil
		}
	}
	added := &Repo{ID: id, Repository: opened}
	w.repos = append(w.repos, added)
	return added, nil
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
