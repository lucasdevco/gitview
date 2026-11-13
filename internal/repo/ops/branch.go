package ops

import (
	"context"
	"errors"
	"strings"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// CheckoutRequest names what to check out: a local branch, or a commit to
// check out without a branch (a detached HEAD). Set exactly one.
type CheckoutRequest struct {
	Branch string `json:"branch"`
	// Commit is a commit id (or any revision); HEAD then points at it
	// directly instead of at a branch.
	Commit string `json:"commit"`
}

// Validate rejects a request naming both or neither of branch and commit,
// and one git would read as an option.
func (request CheckoutRequest) Validate() error {
	switch {
	case request.Branch != "" && request.Commit != "":
		return invalid("pass either branch or commit, not both")
	case request.Commit != "":
		return validateCommit(request.Commit)
	default:
		return validateBranchName("branch", request.Branch)
	}
}

// Checkout switches the working tree and HEAD to a local branch, or to a
// commit with HEAD detached. When local changes would be overwritten git
// refuses, reported as git.LocalChanges with the files git names.
//
//	git switch <branch>
//	git switch --detach <commit>
func Checkout(ctx context.Context, r *repo.Repository, request CheckoutRequest) error {
	command := git.Write("switch", request.Branch)
	if request.Commit != "" {
		command = git.Write("switch", "--detach", request.Commit)
	}
	_, err := r.Runner.Run(ctx, command)
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

// Validate rejects a missing name, "HEAD", and a name or start point git
// would read as an option. Whether the name is valid and unused is checked
// against the repository when the branch is created.
func (request CreateBranchRequest) Validate() error {
	if err := validateBranchName("branch name", request.Name); err != nil {
		return err
	}
	if request.Name == "HEAD" {
		return invalid("%q is not allowed as a branch name; choose another name", request.Name)
	}
	if strings.HasPrefix(request.StartPoint, "-") {
		return invalid("start point %q is not a commit; pass a commit id or branch name, or leave it empty for HEAD", request.StartPoint)
	}
	return nil
}

// CreateBranch creates a local branch at StartPoint, or at HEAD, and
// optionally checks it out. The name must be a valid, unused branch name.
//
//	git branch <name> [<start-point>]
//	git switch -c <name> [<start-point>]
func CreateBranch(ctx context.Context, r *repo.Repository, request CreateBranchRequest) error {
	if err := checkNewBranchName(ctx, r, request.Name); err != nil {
		return err
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

// Validate rejects an empty list and names git would read as options.
func (request DeleteBranchesRequest) Validate() error {
	if len(request.Branches) == 0 {
		return invalid("missing branches; pass at least one local branch name")
	}
	for _, branch := range request.Branches {
		if err := validateBranchName("branch", branch); err != nil {
			return err
		}
	}
	return nil
}

// DeleteBranches deletes local branches. Without Force, git refuses to
// delete a branch that is not merged into its upstream or HEAD: the merged
// branches are still deleted and the rest are reported as
// git.BranchNotMerged, so the caller can ask before retrying them with Force.
// The current branch cannot be deleted.
//
//	git branch -d|-D <branch>...
func DeleteBranches(ctx context.Context, r *repo.Repository, request DeleteBranchesRequest) error {
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

// Validate rejects missing names, "HEAD" as the new name, and names git
// would read as options.
func (request RenameBranchRequest) Validate() error {
	if err := validateBranchName("branch", request.Branch); err != nil {
		return err
	}
	return CreateBranchRequest{Name: request.NewName}.Validate()
}

// RenameBranch renames a local branch, the current one included; its
// upstream configuration moves with it.
//
//	git branch -m <branch> <new-name>
func RenameBranch(ctx context.Context, r *repo.Repository, request RenameBranchRequest) error {
	if err := checkNewBranchName(ctx, r, request.NewName); err != nil {
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

// Validate rejects missing names and names git would read as options.
func (request SetUpstreamRequest) Validate() error {
	if err := validateBranchName("branch", request.Branch); err != nil {
		return err
	}
	return validateBranchName("upstream", request.Upstream)
}

// SetUpstream sets the branch pull and push use by default for a local
// branch.
//
//	git branch --set-upstream-to=<upstream> <branch>
func SetUpstream(ctx context.Context, r *repo.Repository, request SetUpstreamRequest) error {
	_, err := r.Runner.Run(ctx, git.Write("branch", "--set-upstream-to="+request.Upstream, request.Branch))
	return err
}

// checkNewBranchName checks that name is a valid branch name (git
// check-ref-format rules) that no local branch uses yet.
func checkNewBranchName(ctx context.Context, r *repo.Repository, name string) error {
	return checkNewRefName(ctx, r, "refs/heads/", "branch", name)
}

// checkNewRefName checks that name is valid under prefix (git
// check-ref-format rules) and not taken yet. kind names the ref in
// messages, such as "branch" or "tag".
func checkNewRefName(ctx context.Context, r *repo.Repository, prefix, kind, name string) error {
	ref := prefix + name
	if _, err := r.Runner.Run(ctx, git.Read("check-ref-format", ref)); err != nil {
		if isExitCode(err, 1) {
			return invalid("%q is not a valid %s name; avoid spaces, \"..\", \"~^:?*[\\\", a trailing \"/\", \".\" or \".lock\"", name, kind)
		}
		return err
	}
	if _, err := r.Runner.Run(ctx, git.Read("show-ref", "--verify", "--quiet", ref)); err == nil {
		return invalid("a %s named %q already exists; choose another name", kind, name)
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
