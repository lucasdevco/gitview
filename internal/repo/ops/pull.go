package ops

import (
	"context"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// PullRequest says what to pull into the current branch and how to
// integrate it. With neither Remote nor Branch, git pulls the current
// branch's upstream.
type PullRequest struct {
	// Remote is the remote to pull from, e.g. "origin".
	Remote string `json:"remote"`
	// Branch is the branch on the remote, e.g. "main" (not "origin/main");
	// it needs Remote.
	Branch string `json:"branch"`
	// Rebase replays the current branch's own commits on top of the pulled
	// ones instead of merging (--rebase). The merge options below do not
	// apply to it.
	Rebase bool `json:"rebase"`
	// NoCommit stops before creating a merge commit, leaving the merge in
	// progress (--no-commit). A fast-forward still happens.
	NoCommit bool `json:"noCommit"`
	// Log adds the subjects of the merged commits to the merge commit's
	// message (--log).
	Log bool `json:"log"`
	// NoFastForward creates a merge commit even when the branch could be
	// moved forward (--no-ff).
	NoFastForward bool `json:"noFastForward"`
}

// Validate rejects merge options combined with Rebase, a branch without a
// remote, and names git would read as options.
func (request PullRequest) Validate() error {
	if request.Rebase && (request.NoCommit || request.Log || request.NoFastForward) {
		return invalid("noCommit, log and noFastForward only apply to merging; leave them out when rebase is set")
	}
	if request.Branch != "" && request.Remote == "" {
		return invalid("branch %q needs the remote it is on; pass remote, such as origin", request.Branch)
	}
	if request.Remote != "" {
		if err := validateRemoteName(request.Remote); err != nil {
			return err
		}
	}
	if request.Branch != "" {
		return validateBranchName("remote branch", request.Branch)
	}
	return nil
}

// Pull fetches a branch from a remote and integrates it into the current
// branch: merging, unless Rebase. Conflicts are reported as git.Conflict
// and leave the repository merging or rebasing; uncommitted changes in the
// way are reported as git.LocalChanges. It runs as a job: git reports its
// progress.
//
//	git pull --progress (--rebase | --no-rebase [--no-ff] [--log] [--no-commit]) [<remote> [<branch>]]
//
// The integration mode is always explicit, so pull never stops to ask how
// to reconcile diverged branches.
func Pull(ctx context.Context, r *repo.Repository, request PullRequest) error {
	command := git.Write("pull", "--progress")
	if request.Rebase {
		command.Arg("--rebase")
	} else {
		command.Arg("--no-rebase").
			ArgIf(request.NoFastForward, "--no-ff").
			ArgIf(request.Log, "--log").
			ArgIf(request.NoCommit, "--no-commit")
	}
	command.ArgIf(request.Remote != "", request.Remote).ArgIf(request.Branch != "", request.Branch)
	_, err := r.Runner.Run(ctx, command)
	return err
}
