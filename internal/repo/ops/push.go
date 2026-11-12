package ops

import (
	"context"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// PushRequest says which local branches to push to one remote, and whether
// to push every tag.
type PushRequest struct {
	// Remote is the remote to push to, e.g. "origin".
	Remote   string       `json:"remote"`
	Branches []PushBranch `json:"branches"`
	// Tags also pushes every local tag (--tags).
	Tags bool `json:"tags"`
}

// PushBranch is one local branch to push.
type PushBranch struct {
	// Local is the local branch, e.g. "feature/login".
	Local string `json:"local"`
	// Remote is the branch on the remote to update; empty means the same
	// name as Local.
	Remote string `json:"remote"`
	// Track makes Local track the pushed remote branch afterwards (-u).
	Track bool `json:"track"`
}

// Validate rejects a request without a remote or without anything to push,
// and branch names that git would read as options or refspec syntax.
func (request PushRequest) Validate() error {
	if err := validateRemoteName(request.Remote); err != nil {
		return err
	}
	if len(request.Branches) == 0 && !request.Tags {
		return invalid("nothing to push; pass at least one branch, or set tags")
	}
	for _, branch := range request.Branches {
		if err := validateBranchName("local branch", branch.Local); err != nil {
			return err
		}
		if branch.Remote != "" {
			if err := validateBranchName("remote branch", branch.Remote); err != nil {
				return err
			}
		}
	}
	return nil
}

// Push updates branches on a remote from local branches, and pushes every
// tag when asked. Branches that track afterwards are pushed with -u in one
// command, the others in a second; the tags go with the first. A remote
// that refuses an update, because it has commits the local branch lacks or
// a hook declined it, is reported as git.PushRejected: pull first. It runs
// as a job: git reports its progress.
//
//	git push --progress [-u] [--tags] <remote> <local>:<remote-branch>...
func Push(ctx context.Context, r *repo.Repository, request PushRequest) error {
	var tracked, untracked []string
	for _, branch := range request.Branches {
		destination := branch.Remote
		if destination == "" {
			destination = branch.Local
		}
		refspec := branch.Local + ":" + destination
		if branch.Track {
			tracked = append(tracked, refspec)
		} else {
			untracked = append(untracked, refspec)
		}
	}
	tags := request.Tags
	for _, group := range []struct {
		track    bool
		refspecs []string
	}{{true, tracked}, {false, untracked}} {
		if len(group.refspecs) == 0 && !tags {
			continue
		}
		command := git.Write("push", "--progress").
			ArgIf(group.track && len(group.refspecs) > 0, "-u").
			ArgIf(tags, "--tags").
			Arg(request.Remote).
			Arg(group.refspecs...)
		tags = false
		if _, err := r.Runner.Run(ctx, command); err != nil {
			return err
		}
	}
	return nil
}
