package ops

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"

	"gitview/internal/git"
	"gitview/internal/repo"
	"gitview/internal/repo/query"
)

// HunkRange identifies a hunk by its header, @@ -oldStart,oldCount
// +newStart,newCount @@, as GET .../diff shows it.
type HunkRange struct {
	OldStart int `json:"oldStart"`
	OldCount int `json:"oldCount"`
	NewStart int `json:"newStart"`
	NewCount int `json:"newCount"`
}

func (h HunkRange) String() string {
	return fmt.Sprintf("@@ -%d,%d +%d,%d @@", h.OldStart, h.OldCount, h.NewStart, h.NewCount)
}

// HunkRequest names one hunk of one file's diff. The server reads the file's
// current diff, finds the hunk with exactly this range and builds a patch of
// that hunk alone, so other hunks of the file are left as they are.
type HunkRequest struct {
	// Path is the file's path relative to the repository root.
	Path string `json:"path"`
	// OldPath is the original path of a staged rename, as in the staged diff.
	OldPath string    `json:"oldPath,omitempty"`
	Hunk    HunkRange `json:"hunk"`
}

// StageHunk adds one hunk of a file's unstaged changes (index vs. working
// tree, or an untracked file's content) to the index.
//
//	git apply --cached
func StageHunk(ctx context.Context, r *repo.Repository, request HunkRequest) error {
	patch, err := unstagedHunkPatch(ctx, r, request)
	if err != nil {
		return err
	}
	_, err = r.Runner.Run(ctx, git.Write("apply", "--cached").Input(patch))
	return err
}

// UnstageHunk removes one hunk of a file's staged changes (HEAD vs. index)
// from the index, keeping the working tree as it is. A staged rename stays
// a rename.
//
//	git apply --cached -R
func UnstageHunk(ctx context.Context, r *repo.Repository, request HunkRequest) error {
	if err := request.validate(); err != nil {
		return err
	}
	patch, err := hunkPatch(ctx, r, query.DiffStaged, request)
	if err != nil {
		return err
	}
	_, err = r.Runner.Run(ctx, git.Write("apply", "--cached", "-R").Input(patch))
	return err
}

// DiscardHunk reverts one hunk of a file's unstaged changes in the working
// tree; staged changes of the file are kept. Discarding the only hunk of an
// untracked file deletes the file. The change cannot be undone.
//
//	git apply -R
func DiscardHunk(ctx context.Context, r *repo.Repository, request HunkRequest) error {
	patch, err := unstagedHunkPatch(ctx, r, request)
	if err != nil {
		return err
	}
	_, err = r.Runner.Run(ctx, git.Write("apply", "-R").Input(patch))
	return err
}

func (r HunkRequest) validate() error {
	if r.Path == "" {
		return invalid("missing path; pass the file path relative to the repository root")
	}
	for _, path := range []string{r.Path, r.OldPath} {
		if path != "" && !filepath.IsLocal(path) {
			return invalid("path %q is not inside the repository; pass paths relative to the repository root", path)
		}
	}
	h := r.Hunk
	if h.OldStart < 0 || h.OldCount < 0 || h.NewStart < 0 || h.NewCount < 0 || h.OldCount+h.NewCount == 0 {
		return invalid("missing or invalid hunk; pass the hunk's oldStart, oldCount, newStart and newCount from its @@ header")
	}
	return nil
}

// unstagedHunkPatch builds the patch of a hunk shown in the unstaged list:
// a tracked file's index-to-working-tree diff, or an untracked file's
// content.
func unstagedHunkPatch(ctx context.Context, r *repo.Repository, request HunkRequest) ([]byte, error) {
	if err := request.validate(); err != nil {
		return nil, err
	}
	listed, err := r.Runner.Run(ctx, git.Read("ls-files", "-z", "--", literal(request.Path)))
	if err != nil {
		return nil, err
	}
	source := query.DiffUnstaged
	if len(listed.Stdout) == 0 {
		source = query.DiffUntracked
	}
	return hunkPatch(ctx, r, source, HunkRequest{Path: request.Path, Hunk: request.Hunk})
}

// hunkPatch reads the file's diff from source and returns a patch of the
// requested hunk alone.
func hunkPatch(ctx context.Context, r *repo.Repository, source query.DiffSource, request HunkRequest) ([]byte, error) {
	diff, err := query.Diff(ctx, r, query.DiffRequest{Source: source, Path: request.Path, OldPath: request.OldPath})
	var invalidQuery *query.InvalidRequestError
	if errors.As(err, &invalidQuery) {
		return nil, invalid("%s", invalidQuery.Message)
	}
	if err != nil {
		return nil, err
	}
	switch {
	case diff.Binary:
		return nil, invalid("%s is a binary file; stage, unstage or discard the whole file instead", request.Path)
	case diff.TooLarge:
		return nil, invalid("the diff of %s is too large to act on single hunks; stage, unstage or discard the whole file instead", request.Path)
	}
	patch := parsePatch(diff.Patch)
	if patch.combined {
		return nil, invalid("%s has a merge conflict; resolve the conflict before staging or discarding parts of it", request.Path)
	}
	for _, hunk := range patch.hunks {
		if hunk.HunkRange == request.Hunk {
			return patch.single(hunk), nil
		}
	}
	return nil, invalid("the hunk %s is no longer in the diff of %s; refresh the diff and try again", request.Hunk, request.Path)
}
