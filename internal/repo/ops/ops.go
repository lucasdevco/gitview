// Package ops changes a repository through the git execution layer: the
// index, the working tree, commits and refs.
//
// Every operation takes a request struct decoded from the JSON body of
// POST /api/v1/repos/{repoId}/operations/{op} and must be run through
// workspace.Repo.Write, which serializes writes, retries index.lock conflicts
// and records the commands in the command log. An operation reports a request
// it cannot carry out as *InvalidRequestError before running any command.
package ops

import (
	"fmt"
	"path/filepath"
)

// InvalidRequestError reports a request that cannot be carried out as asked.
// Its message says what to change.
type InvalidRequestError struct{ Message string }

func (e *InvalidRequestError) Error() string { return e.Message }

func invalid(format string, args ...any) error {
	return &InvalidRequestError{Message: fmt.Sprintf(format, args...)}
}

// validatePaths checks that paths is non-empty and every path is relative to
// the repository root and stays inside it.
func validatePaths(paths []string) error {
	if len(paths) == 0 {
		return invalid("missing paths; pass at least one file path relative to the repository root")
	}
	for _, path := range paths {
		if path == "" || !filepath.IsLocal(path) {
			return invalid("path %q is not inside the repository; pass paths relative to the repository root", path)
		}
	}
	return nil
}

// literal turns a path into a pathspec that matches only that path, so names
// containing *, ? or [ are not treated as globs.
func literal(path string) string { return ":(literal)" + path }

// maxPathBytes bounds the pathspec bytes passed to one git invocation so a
// very long file list stays well below the operating system's argument limit.
const maxPathBytes = 64 << 10

// pathspecBatches splits paths into literal pathspec lists of at most about
// maxPathBytes each.
func pathspecBatches(paths []string) [][]string {
	var batches [][]string
	var batch []string
	size := 0
	for _, path := range paths {
		spec := literal(path)
		if len(batch) > 0 && size+len(spec) > maxPathBytes {
			batches = append(batches, batch)
			batch, size = nil, 0
		}
		batch = append(batch, spec)
		size += len(spec) + 1
	}
	if len(batch) > 0 {
		batches = append(batches, batch)
	}
	return batches
}
