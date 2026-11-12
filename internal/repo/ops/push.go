package ops

import (
	"context"
	"strings"

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
	if request.Remote == "" {
		return invalid("missing remote; pass the name of a configured remote such as origin")
	}
	if strings.HasPrefix(request.Remote, "-") {
		return invalid("remote %q is not a remote name; pass the name of a configured remote such as origin", request.Remote)
	}
	if len(request.Branches) == 0 && !request.Tags {
		return invalid("nothing to push; pass at least one branch, or set tags")
	}
	for _, branch := range request.Branches {
		if err := validatePushBranch("local", branch.Local, false); err != nil {
			return err
		}
		if err := validatePushBranch("remote", branch.Remote, true); err != nil {
			return err
		}
	}
	return nil
}

// validatePushBranch accepts a plain branch name: one that cannot be read
// as an option ("-f"), a forced refspec ("+main") or a src:dst pair.
func validatePushBranch(field, name string, optional bool) error {
	if name == "" {
		if optional {
			return nil
		}
		return invalid("missing %s branch; pass a local branch name such as \"main\"", field)
	}
	if strings.HasPrefix(name, "-") || strings.HasPrefix(name, "+") || strings.ContainsAny(name, ": \t\n") {
		return invalid("%s branch %q is not a branch name; branch names cannot start with \"-\" or \"+\" or contain \":\" or spaces", field, name)
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
	if err := request.Validate(); err != nil {
		return err
	}
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
