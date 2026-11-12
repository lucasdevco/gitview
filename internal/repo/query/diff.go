package query

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// DiffSource says which two versions of a file a diff compares.
type DiffSource string

const (
	// DiffStaged compares HEAD with the index (what the next commit adds).
	DiffStaged DiffSource = "staged"
	// DiffUnstaged compares the index with the working tree.
	DiffUnstaged DiffSource = "unstaged"
	// DiffUntracked shows an untracked file's whole content as added.
	DiffUntracked DiffSource = "untracked"
	// DiffCommit compares a commit with its first parent, or with nothing
	// for a root commit. Set DiffRequest.Commit.
	DiffCommit DiffSource = "commit"
	// DiffStash shows a file saved in a stash: a tracked file against the
	// commit the stash was made on, an untracked one as added. Set
	// DiffRequest.Commit to the stash's oid.
	DiffStash DiffSource = "stash"
)

// MaxDiffBytes is the largest patch returned in full. Larger diffs are
// flagged TooLarge so the interface stays responsive.
const MaxDiffBytes = 512 << 10

// DiffRequest selects one file's diff.
type DiffRequest struct {
	Source DiffSource
	// Path is the file's path relative to the repository root.
	Path string
	// OldPath is the path before a rename or copy (staged or in a commit).
	// Pass it so the diff pairs both names and shows a rename instead of an
	// added file.
	OldPath string
	// Commit is the commit id to diff for DiffCommit, or the stash's oid for
	// DiffStash; required for those two only.
	Commit string
}

// FileDiff is one file's diff.
type FileDiff struct {
	Path    string `json:"path"`
	OldPath string `json:"oldPath,omitempty"`
	// Binary is true when git considers either side binary; Patch is empty.
	Binary bool `json:"binary"`
	// TooLarge is true when the patch exceeds MaxDiffBytes; Patch is empty.
	TooLarge bool `json:"tooLarge"`
	// Patch is git's unified diff for this file, headers included. It is
	// empty when the file has no textual difference.
	Patch string `json:"patch"`
}

// InvalidRequestError reports a request that cannot be answered as asked.
// Its message says what to change.
type InvalidRequestError struct{ Message string }

func (e *InvalidRequestError) Error() string { return e.Message }

// Diff returns one file's diff with rename detection. Text conversion and
// external diff drivers are disabled so the patch is the file's real content,
// the same text later hunk operations apply.
func Diff(ctx context.Context, r *repo.Repository, request DiffRequest) (FileDiff, error) {
	if err := request.validate(); err != nil {
		return FileDiff{}, err
	}
	// Fixed a/ and b/ prefixes, whatever diff.noprefix or diff.mnemonicPrefix
	// say, keep the patch appliable by the hunk operations.
	options := []string{"--no-color", "--no-ext-diff", "--no-textconv", "--find-renames", "--src-prefix=a/", "--dst-prefix=b/"}
	var command *git.Command
	switch request.Source {
	case DiffStaged:
		command = git.Read("diff", "--cached").Arg(options...).Arg("--").ArgIf(request.OldPath != "", literal(request.OldPath)).Arg(literal(request.Path))
	case DiffUnstaged:
		command = git.Read("diff").Arg(options...).Arg("--", literal(request.Path))
	case DiffCommit:
		commit, err := readCommit(ctx, r, request.Commit)
		if err != nil {
			return FileDiff{}, err
		}
		command = commitDiffCommand(commit.GraphCommit, request)
	case DiffStash:
		var err error
		if command, err = stashDiffCommand(ctx, r, request); err != nil {
			return FileDiff{}, err
		}
	case DiffUntracked:
		info, err := os.Lstat(filepath.Join(r.Root, request.Path))
		if err != nil {
			return FileDiff{}, &InvalidRequestError{Message: fmt.Sprintf("cannot read untracked file %q: %v; refresh the file list", request.Path, err)}
		}
		if info.IsDir() {
			// A nested repository shows up as an untracked directory; it has no
			// file content to show.
			return FileDiff{Path: request.Path}, nil
		}
		// --no-index exits 1 when the files differ, which they always do here.
		command = git.Read("diff", "--no-index").Arg(options...).Arg("--", os.DevNull, request.Path)
	}

	result, err := r.Runner.Run(ctx, command)
	var gitErr *git.Error
	if err != nil && !(request.Source == DiffUntracked && errors.As(err, &gitErr) && gitErr.ExitCode == 1) {
		return FileDiff{}, err
	}
	diff := FileDiff{Path: request.Path, OldPath: request.OldPath}
	switch {
	case isBinaryPatch(result.Stdout):
		diff.Binary = true
	case len(result.Stdout) > MaxDiffBytes:
		diff.TooLarge = true
	default:
		diff.Patch = string(result.Stdout)
	}
	return diff, nil
}

// commitDiffCommand diffs one file of a commit against its first parent.
func commitDiffCommand(commit GraphCommit, request DiffRequest) *git.Command {
	return git.Read("diff-tree", "-r", "--patch", "--no-color", "--no-ext-diff", "--no-textconv").
		Arg(commitDiffArgs(commit)...).
		Arg("--").ArgIf(request.OldPath != "", literal(request.OldPath)).Arg(literal(request.Path))
}

func (r DiffRequest) validate() error {
	switch r.Source {
	case DiffStaged, DiffUnstaged, DiffUntracked:
	case DiffCommit:
		if r.Commit == "" {
			return &InvalidRequestError{Message: "missing commit; pass the commit id whose change to show"}
		}
	case DiffStash:
		if r.Commit == "" {
			return &InvalidRequestError{Message: "missing commit; pass the stash's oid from the stash list"}
		}
	case "":
		return &InvalidRequestError{Message: "missing diff source; use staged, unstaged, untracked, commit or stash"}
	default:
		return &InvalidRequestError{Message: fmt.Sprintf("unknown diff source %q; use staged, unstaged, untracked, commit or stash", r.Source)}
	}
	if r.Path == "" {
		return &InvalidRequestError{Message: "missing path; pass the file path relative to the repository root"}
	}
	for _, path := range []string{r.Path, r.OldPath} {
		if path != "" && !filepath.IsLocal(path) {
			return &InvalidRequestError{Message: fmt.Sprintf("path %q is not inside the repository; pass a path relative to the repository root", path)}
		}
	}
	return nil
}

// literal turns a path into a pathspec that matches only that path, so names
// containing *, ? or [ are not treated as globs.
func literal(path string) string { return ":(literal)" + path }

// isBinaryPatch reports whether git printed a binary notice instead of
// hunks. The notice is a header line, so only lines before the first hunk
// are inspected; content lines always start with ' ', '+' or '-'.
func isBinaryPatch(patch []byte) bool {
	for line := range bytes.Lines(patch) {
		if bytes.HasPrefix(line, []byte("@@")) {
			return false
		}
		if bytes.HasPrefix(line, []byte("Binary files ")) || bytes.HasPrefix(line, []byte("GIT binary patch")) {
			return true
		}
	}
	return false
}
