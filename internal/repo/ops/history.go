package ops

import (
	"context"
	"strings"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// The operations on one commit of the history: tag it, reset the current
// branch to it, revert it, or cherry-pick it onto the current branch.

// CreateTagRequest describes a new tag.
type CreateTagRequest struct {
	Name string `json:"name"`
	// Commit is the commit id (or any revision) the tag points to.
	Commit string `json:"commit"`
	// Message makes an annotated tag carrying it; without one (empty or only
	// whitespace) the tag is lightweight.
	Message string `json:"message"`
}

// Validate rejects a missing name or commit and ones git would read as
// options. Whether the name is valid and unused is checked against the
// repository when the tag is created.
func (request CreateTagRequest) Validate() error {
	if request.Name == "" {
		return invalid("missing tag name; pass a name such as \"v1.0\"")
	}
	if strings.HasPrefix(request.Name, "-") {
		return invalid("%q is not a tag name; tag names cannot start with \"-\"", request.Name)
	}
	return validateCommit(request.Commit)
}

// CreateTag tags a commit: annotated (with the tagger and Message) when
// there is a message, lightweight otherwise. The name must be a valid,
// unused tag name and the commit must exist (git.RefNotFound otherwise).
//
//	git tag -a -m <message> <name> <commit>
//	git tag <name> <commit>
func CreateTag(ctx context.Context, r *repo.Repository, request CreateTagRequest) error {
	if err := checkNewRefName(ctx, r, "refs/tags/", "tag", request.Name); err != nil {
		return err
	}
	if _, err := resolveCommit(ctx, r, request.Commit); err != nil {
		return err
	}
	message := strings.TrimSpace(request.Message)
	command := git.Write("tag").ArgIf(message != "", "-a", "-m", message).Arg(request.Name, request.Commit)
	_, err := r.Runner.Run(ctx, command)
	return err
}

// ResetMode is how far git reset goes beyond moving the branch.
type ResetMode string

const (
	// ResetSoft moves only the branch; the index and working tree keep
	// every change, which shows up as staged.
	ResetSoft ResetMode = "soft"
	// ResetMixed also resets the index; the working tree keeps every
	// change, unstaged. The default.
	ResetMixed ResetMode = "mixed"
	// ResetHard also resets the working tree: uncommitted changes to
	// tracked files are lost.
	ResetHard ResetMode = "hard"
)

// ResetRequest moves the current branch (or a detached HEAD) to a commit.
type ResetRequest struct {
	Commit string `json:"commit"`
	// Mode is soft, mixed or hard; empty means mixed.
	Mode ResetMode `json:"mode"`
}

// Validate rejects a missing or option-like commit and an unknown mode.
func (request ResetRequest) Validate() error {
	switch request.Mode {
	case "", ResetSoft, ResetMixed, ResetHard:
	default:
		return invalid("unknown reset mode %q; pass soft, mixed or hard", request.Mode)
	}
	return validateCommit(request.Commit)
}

// Reset moves the current branch, or HEAD when detached, to a commit. The
// mode decides what happens to the index and working tree; a hard reset
// discards uncommitted changes and cannot be undone.
//
//	git reset --soft|--mixed|--hard <commit>
func Reset(ctx context.Context, r *repo.Repository, request ResetRequest) error {
	mode := request.Mode
	if mode == "" {
		mode = ResetMixed
	}
	_, err := r.Runner.Run(ctx, git.Write("reset", "--"+string(mode), request.Commit))
	return err
}

// CherryPickRequest names the commit to cherry-pick.
type CherryPickRequest struct {
	// Commit is a commit id (or any revision).
	Commit string `json:"commit"`
}

// Validate rejects a missing or option-like commit.
func (request CherryPickRequest) Validate() error { return validateCommit(request.Commit) }

// RevertRequest names the commit to revert.
type RevertRequest struct {
	// Commit is a commit id (or any revision).
	Commit string `json:"commit"`
}

// Validate rejects a missing or option-like commit.
func (request RevertRequest) Validate() error { return validateCommit(request.Commit) }

// CherryPick applies the changes a commit introduced on top of the current
// branch as a new commit with the same message and author. A merge commit's
// changes are taken relative to its first parent (-m 1). When the changes
// conflict, git stops with the cherry-pick in progress, reported as
// git.Conflict; the repository's state is "cherry-picking" until the
// resolution is committed or the cherry-pick is aborted.
//
//	git cherry-pick [-m 1] <commit>
func CherryPick(ctx context.Context, r *repo.Repository, request CherryPickRequest) error {
	return applyCommit(ctx, r, git.Write("cherry-pick"), request.Commit)
}

// Revert adds a commit that undoes the changes a commit introduced, with
// git's default message. A merge commit is undone relative to its first
// parent (-m 1), i.e. the merged branch's changes are taken out. When the
// changes conflict, git stops with the revert in progress, reported as
// git.Conflict; the repository's state is "reverting" until the resolution
// is committed or the revert is aborted.
//
//	git revert --no-edit [-m 1] <commit>
func Revert(ctx context.Context, r *repo.Repository, request RevertRequest) error {
	return applyCommit(ctx, r, git.Write("revert", "--no-edit"), request.Commit)
}

// applyCommit runs a cherry-pick or revert of commit, choosing the first
// parent as the mainline when it is a merge commit.
func applyCommit(ctx context.Context, r *repo.Repository, command *git.Command, commit string) error {
	parents, err := resolveCommit(ctx, r, commit)
	if err != nil {
		return err
	}
	_, err = r.Runner.Run(ctx, command.ArgIf(parents > 1, "-m", "1").Arg(commit))
	return err
}

// resolveCommit checks that commit names a commit, reported as
// git.RefNotFound otherwise, and returns how many parents it has.
func resolveCommit(ctx context.Context, r *repo.Repository, commit string) (parents int, err error) {
	resolved, err := r.Runner.Run(ctx, git.Read("rev-parse", "--verify", "--end-of-options", commit+"^{commit}"))
	if err != nil {
		return 0, err
	}
	oid := strings.TrimSpace(string(resolved.Stdout))
	result, err := r.Runner.Run(ctx, git.Read("rev-list", "--parents", "-n", "1", oid))
	if err != nil {
		return 0, err
	}
	return len(strings.Fields(string(result.Stdout))) - 1, nil
}

// AbortCherryPick abandons the cherry-pick in progress and restores the
// branch, index and working tree to how they were before it. Without one in
// progress it fails with git.NothingInProgress.
//
//	git cherry-pick --abort
func AbortCherryPick(ctx context.Context, r *repo.Repository, _ AbortRequest) error {
	_, err := r.Runner.Run(ctx, git.Write("cherry-pick", "--abort"))
	return err
}

// AbortRevert abandons the revert in progress and restores the branch,
// index and working tree to how they were before it. Without one in
// progress it fails with git.NothingInProgress.
//
//	git revert --abort
func AbortRevert(ctx context.Context, r *repo.Repository, _ AbortRequest) error {
	_, err := r.Runner.Run(ctx, git.Write("revert", "--abort"))
	return err
}
