package ops

import (
	"context"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// MergeRequest names the branch to merge into the current branch and how.
type MergeRequest struct {
	// Branch is the local or remote-tracking branch (or any revision) to
	// merge, such as "feature/login" or "origin/main".
	Branch string `json:"branch"`
	// NoFastForward creates a merge commit even when the current branch
	// could simply be moved forward (--no-ff).
	NoFastForward bool `json:"noFastForward"`
	// Log adds the subjects of the merged commits to the merge commit's
	// message (--log).
	Log bool `json:"log"`
	// NoCommit stops before creating the merge commit, leaving the merge in
	// progress with its result staged for review (--no-commit). A
	// fast-forward creates no merge commit, so it still happens; combine
	// with NoFastForward to always stop.
	NoCommit bool `json:"noCommit"`
}

// Validate rejects a missing branch or one git would read as an option.
func (request MergeRequest) Validate() error { return validateBranchName("branch", request.Branch) }

// Merge merges a branch into the current branch. When the branches
// conflict, git stops with the merge in progress and the conflicted files
// unmerged; that is reported as git.Conflict, and the repository's state
// becomes "merging" until the merge is committed or aborted.
//
//	git merge [--no-ff] [--log] [--no-commit] <branch>
func Merge(ctx context.Context, r *repo.Repository, request MergeRequest) error {
	command := git.Write("merge").
		ArgIf(request.NoFastForward, "--no-ff").
		ArgIf(request.Log, "--log").
		ArgIf(request.NoCommit, "--no-commit").
		Arg(request.Branch)
	_, err := r.Runner.Run(ctx, command)
	return err
}

// RebaseRequest names the branch to rebase the current branch onto.
type RebaseRequest struct {
	// Onto is the local or remote-tracking branch (or any revision) the
	// current branch's own commits are replayed on.
	Onto string `json:"onto"`
}

// Rebase replays the commits of the current branch that Onto lacks on top
// of Onto, rewriting them. git refuses while there are uncommitted changes
// (git.LocalChanges). When a replayed commit conflicts, git stops with the
// rebase in progress, reported as git.Conflict; the repository's state is
// "rebasing" until the rebase is continued or aborted.
//
//	git rebase <onto>
func Rebase(ctx context.Context, r *repo.Repository, request RebaseRequest) error {
	_, err := r.Runner.Run(ctx, git.Write("rebase", request.Onto))
	return err
}

// Validate rejects a missing onto or one git would read as an option.
func (request RebaseRequest) Validate() error { return validateBranchName("onto", request.Onto) }

// AbortRequest is the empty request of the abort operations.
type AbortRequest struct{}

// Validate accepts the empty request.
func (AbortRequest) Validate() error { return nil }

// AbortMerge abandons the merge in progress and restores the branch, index
// and working tree to how they were before it. Without a merge in progress
// it fails with git.NothingInProgress.
//
//	git merge --abort
func AbortMerge(ctx context.Context, r *repo.Repository, _ AbortRequest) error {
	_, err := r.Runner.Run(ctx, git.Write("merge", "--abort"))
	return err
}

// AbortRebase abandons the rebase in progress and returns to the branch and
// commit it started from. Without a rebase in progress it fails with
// git.NothingInProgress.
//
//	git rebase --abort
func AbortRebase(ctx context.Context, r *repo.Repository, _ AbortRequest) error {
	_, err := r.Runner.Run(ctx, git.Write("rebase", "--abort"))
	return err
}
