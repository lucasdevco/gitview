package ops

import (
	"context"
	"errors"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// FetchRequest says what to fetch. With neither All nor Remote, git fetches
// from its default remote: the current branch's, or else origin.
type FetchRequest struct {
	// All fetches from every remote (--all).
	All bool `json:"all"`
	// Remote names the one remote to fetch from; it cannot be combined with
	// All.
	Remote string `json:"remote"`
	// Prune deletes remote-tracking branches whose branch is gone from the
	// remote (--prune).
	Prune bool `json:"prune"`
	// Tags fetches every tag of the remote, not only the tags on fetched
	// commits (--tags).
	Tags bool `json:"tags"`
}

// Validate rejects a request that names both all remotes and one remote, or
// a remote that git would read as an option.
func (request FetchRequest) Validate() error {
	if request.All && request.Remote != "" {
		return invalid("choose either all remotes or remote %q, not both", request.Remote)
	}
	if request.Remote != "" {
		return validateRemoteName(request.Remote)
	}
	return nil
}

// Fetch downloads commits, branches and tags from remotes and updates the
// remote-tracking branches. It runs as a job: git reports its progress.
func Fetch(ctx context.Context, r *repo.Repository, request FetchRequest) error {
	command := git.Write("fetch", "--progress").
		ArgIf(request.All, "--all").
		ArgIf(request.Remote != "", request.Remote).
		ArgIf(request.Prune, "--prune").
		ArgIf(request.Tags, "--tags")
	_, err := r.Runner.Run(ctx, command)
	return err
}

// FetchIntoRequest names a local branch to bring up to date with a branch
// on a remote, usually the one it tracks, without checking it out.
type FetchIntoRequest struct {
	// Remote is the remote to fetch from, e.g. "origin".
	Remote string `json:"remote"`
	// Branch is the branch on the remote, e.g. "main" (not "origin/main").
	Branch string `json:"branch"`
	// Local is the local branch to move; it must not be checked out.
	Local string `json:"local"`
}

// Validate rejects missing names and names git would read as options or
// refspec syntax.
func (request FetchIntoRequest) Validate() error {
	if err := validateRemoteName(request.Remote); err != nil {
		return err
	}
	if err := validateBranchName("remote branch", request.Branch); err != nil {
		return err
	}
	return validateBranchName("local branch", request.Local)
}

// FetchInto (Sourcetree's 拿来) fetches a remote branch and fast-forwards a
// local branch that is not checked out to it, updating the remote-tracking
// branch too. When the local branch has commits the remote branch lacks,
// git refuses (non-fast-forward) and nothing moves; merge or rebase it
// instead. It runs as a job: git reports its progress.
//
//	git fetch --progress <remote> <branch>:<local>
func FetchInto(ctx context.Context, r *repo.Repository, request FetchIntoRequest) error {
	_, err := r.Runner.Run(ctx, git.Write("fetch", "--progress", request.Remote, request.Branch+":"+request.Local))
	var gitErr *git.Error
	if errors.As(err, &gitErr) && gitErr.Kind == git.PushRejected {
		// git marks the refused update "[rejected]" as it would a push, but
		// pulling first is not the remedy here.
		refused := *gitErr
		refused.Kind = git.Failed
		return &refused
	}
	return err
}
