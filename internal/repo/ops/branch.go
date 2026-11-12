package ops

import (
	"context"
	"errors"
	"strings"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// CheckoutRequest names the local branch to check out.
type CheckoutRequest struct {
	Branch string `json:"branch"`
}

// Checkout switches the working tree and HEAD to a local branch. When local
// changes would be overwritten git refuses, reported as git.LocalChanges with
// the files git names.
//
//	git switch <branch>
func Checkout(ctx context.Context, r *repo.Repository, request CheckoutRequest) error {
	if err := validateBranchArgument("branch", request.Branch); err != nil {
		return err
	}
	_, err := r.Runner.Run(ctx, git.Write("switch", request.Branch))
	return err
}

// CreateBranchRequest describes a new local branch.
type CreateBranchRequest struct {
	Name string `json:"name"`
	// StartPoint is the commit (or any revision) the branch starts at; empty
	// means the working copy's parent, HEAD.
	StartPoint string `json:"startPoint"`
	// Checkout switches to the new branch after creating it.
	Checkout bool `json:"checkout"`
}

// CreateBranch creates a local branch at StartPoint, or at HEAD, and
// optionally checks it out. The name must be a valid, unused branch name.
//
//	git branch <name> [<start-point>]
//	git switch -c <name> [<start-point>]
func CreateBranch(ctx context.Context, r *repo.Repository, request CreateBranchRequest) error {
	if err := validateNewBranchName(ctx, r, request.Name); err != nil {
		return err
	}
	if strings.HasPrefix(request.StartPoint, "-") {
		return invalid("start point %q is not a commit; pass a commit id or branch name, or leave it empty for HEAD", request.StartPoint)
	}
	command := git.Write("branch", request.Name)
	if request.Checkout {
		command = git.Write("switch", "-c", request.Name)
	}
	_, err := r.Runner.Run(ctx, command.ArgIf(request.StartPoint != "", request.StartPoint))
	return err
}

// DeleteBranchesRequest names local branches to delete.
type DeleteBranchesRequest struct {
	Branches []string `json:"branches"`
	// Force deletes branches even when their commits are not merged.
	Force bool `json:"force"`
}

// DeleteBranches deletes local branches. Without Force, git refuses to
// delete a branch that is not merged into its upstream or HEAD: the merged
// branches are still deleted and the rest are reported as
// git.BranchNotMerged, so the caller can ask before retrying them with Force.
// The current branch cannot be deleted.
//
//	git branch -d|-D <branch>...
func DeleteBranches(ctx context.Context, r *repo.Repository, request DeleteBranchesRequest) error {
	if len(request.Branches) == 0 {
		return invalid("missing branches; pass at least one local branch name")
	}
	for _, branch := range request.Branches {
		if err := validateBranchArgument("branch", branch); err != nil {
			return err
		}
	}
	flag := "-d"
	if request.Force {
		flag = "-D"
	}
	_, err := r.Runner.Run(ctx, git.Write("branch", flag).Arg(request.Branches...))
	return err
}

// RenameBranchRequest renames a local branch.
type RenameBranchRequest struct {
	Branch  string `json:"branch"`
	NewName string `json:"newName"`
}

// RenameBranch renames a local branch, the current one included; its
// upstream configuration moves with it.
//
//	git branch -m <branch> <new-name>
func RenameBranch(ctx context.Context, r *repo.Repository, request RenameBranchRequest) error {
	if err := validateBranchArgument("branch", request.Branch); err != nil {
		return err
	}
	if err := validateNewBranchName(ctx, r, request.NewName); err != nil {
		return err
	}
	_, err := r.Runner.Run(ctx, git.Write("branch", "-m", request.Branch, request.NewName))
	return err
}

// SetUpstreamRequest makes a local branch track another branch.
type SetUpstreamRequest struct {
	Branch string `json:"branch"`
	// Upstream is the branch to track, usually a remote-tracking branch such
	// as "origin/main".
	Upstream string `json:"upstream"`
}

// SetUpstream sets the branch pull and push use by default for a local
// branch.
//
//	git branch --set-upstream-to=<upstream> <branch>
func SetUpstream(ctx context.Context, r *repo.Repository, request SetUpstreamRequest) error {
	if err := validateBranchArgument("branch", request.Branch); err != nil {
		return err
	}
	if err := validateBranchArgument("upstream", request.Upstream); err != nil {
		return err
	}
	_, err := r.Runner.Run(ctx, git.Write("branch", "--set-upstream-to="+request.Upstream, request.Branch))
	return err
}

// validateNewBranchName checks that name is a valid branch name (git
// check-ref-format rules) that no local branch uses yet.
func validateNewBranchName(ctx context.Context, r *repo.Repository, name string) error {
	if err := validateBranchArgument("branch name", name); err != nil {
		return err
	}
	if name == "HEAD" {
		return invalid("%q is not allowed as a branch name; choose another name", name)
	}
	ref := "refs/heads/" + name
	if _, err := r.Runner.Run(ctx, git.Read("check-ref-format", ref)); err != nil {
		if isExitCode(err, 1) {
			return invalid("%q is not a valid branch name; avoid spaces, \"..\", \"~^:?*[\\\", a trailing \"/\", \".\" or \".lock\"", name)
		}
		return err
	}
	if _, err := r.Runner.Run(ctx, git.Read("show-ref", "--verify", "--quiet", ref)); err == nil {
		return invalid("a branch named %q already exists; choose another name", name)
	} else if !isExitCode(err, 1) {
		return err
	}
	return nil
}

// isExitCode reports whether err is a git failure with the given exit code.
func isExitCode(err error, code int) bool {
	var gitErr *git.Error
	return errors.As(err, &gitErr) && gitErr.ExitCode == code
}

// validateBranchArgument rejects a missing name or one git would read as an
// option. Whether the branch exists is left to git.
func validateBranchArgument(field, name string) error {
	if name == "" {
		return invalid("missing %s; pass a local branch name such as \"main\"", field)
	}
	if name[0] == '-' {
		return invalid("%s %q is not a branch name; branch names cannot start with \"-\"", field, name)
	}
	return nil
}
