package ops

import (
	"context"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// FilesRequest names whole files to act on, by path relative to the
// repository root. For a staged rename, list both the new and the old path.
type FilesRequest struct {
	Paths []string `json:"paths"`
}

// Validate rejects an empty list and paths outside the repository.
func (request FilesRequest) Validate() error { return validatePaths(request.Paths) }

// Stage adds the current content of each file to the index: new and modified
// files are added, deleted files are removed from the index.
//
//	git add -- <path>...
func Stage(ctx context.Context, r *repo.Repository, request FilesRequest) error {
	for _, batch := range pathspecBatches(request.Paths) {
		if _, err := r.Runner.Run(ctx, git.Write("add", "--").Arg(batch...)); err != nil {
			return err
		}
	}
	return nil
}

// Unstage resets each file's index entry to HEAD, keeping the working tree
// as it is. Before the first commit it removes the files from the index.
//
//	git reset --quiet -- <path>...
func Unstage(ctx context.Context, r *repo.Repository, request FilesRequest) error {
	for _, batch := range pathspecBatches(request.Paths) {
		if _, err := r.Runner.Run(ctx, git.Write("reset", "--quiet", "--").Arg(batch...)); err != nil {
			return err
		}
	}
	return nil
}
