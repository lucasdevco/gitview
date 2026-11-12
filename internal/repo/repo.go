// Package repo locates a Git repository on disk. Its subpackages read
// (query) and change (ops) that repository through the git execution layer.
package repo

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gitview/internal/git"
)

// Repository is an opened, non-bare Git repository.
type Repository struct {
	// Root is the absolute path of the working tree's top-level directory.
	Root string
	// GitDir is the absolute path of this working tree's git directory, where
	// HEAD, index and in-progress state files such as MERGE_HEAD live.
	GitDir string
	// Runner executes git commands in Root.
	Runner git.Runner
}

// Name is the repository's display name: the working tree directory name.
func (r *Repository) Name() string { return filepath.Base(r.Root) }

// OpenError explains why a path could not be opened as a repository.
type OpenError struct {
	Path    string
	Message string
	Err     error
}

func (e *OpenError) Error() string { return e.Message }
func (e *OpenError) Unwrap() error { return e.Err }

// Open finds the repository containing path. path may be the working tree
// root or any directory inside it.
func Open(ctx context.Context, path string) (*Repository, error) {
	if path == "" {
		path = "."
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, &OpenError{Path: path, Message: fmt.Sprintf("cannot resolve path %q: %v", path, err), Err: err}
	}
	info, err := os.Stat(abs)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return nil, &OpenError{Path: abs, Message: fmt.Sprintf("%s does not exist; check the path and try again", abs), Err: err}
	case err != nil:
		return nil, &OpenError{Path: abs, Message: fmt.Sprintf("cannot open %s: %v", abs, err), Err: err}
	case !info.IsDir():
		return nil, &OpenError{Path: abs, Message: fmt.Sprintf("%s is not a directory; pass the repository folder instead", abs)}
	}

	runner := git.NewRunner(abs)
	result, err := runner.Run(ctx, git.Read("rev-parse", "--is-bare-repository", "--absolute-git-dir"))
	if errors.Is(err, git.NotRepository) {
		return nil, &OpenError{
			Path: abs,
			Message: fmt.Sprintf("%s is not inside a Git repository. Run \"git init\" there to create one, "+
				"or pass the path of an existing repository: gitview <path>", abs),
			Err: err,
		}
	}
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimSpace(string(result.Stdout)), "\n")
	if len(lines) != 2 {
		return nil, fmt.Errorf("unexpected git rev-parse output: %q", result.Stdout)
	}
	if lines[0] == "true" {
		return nil, &OpenError{
			Path:    abs,
			Message: fmt.Sprintf("%s is a bare repository, which has no working tree to manage; open a clone with a working tree instead", abs),
		}
	}
	result, err = runner.Run(ctx, git.Read("rev-parse", "--show-toplevel"))
	if err != nil {
		return nil, &OpenError{
			Path:    abs,
			Message: fmt.Sprintf("%s is inside a git directory, not a working tree; open the working tree folder instead", abs),
			Err:     err,
		}
	}
	root := strings.TrimSpace(string(result.Stdout))
	return &Repository{Root: root, GitDir: lines[1], Runner: git.NewRunner(root)}, nil
}
