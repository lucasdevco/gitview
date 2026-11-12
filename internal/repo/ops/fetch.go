package ops

import (
	"context"
	"strings"

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
	if strings.HasPrefix(request.Remote, "-") {
		return invalid("remote %q is not a remote name; pass the name of a configured remote such as origin", request.Remote)
	}
	return nil
}

// Fetch downloads commits, branches and tags from remotes and updates the
// remote-tracking branches. It runs as a job: git reports its progress.
func Fetch(ctx context.Context, r *repo.Repository, request FetchRequest) error {
	if err := request.Validate(); err != nil {
		return err
	}
	command := git.Write("fetch", "--progress").
		ArgIf(request.All, "--all").
		ArgIf(request.Remote != "", request.Remote).
		ArgIf(request.Prune, "--prune").
		ArgIf(request.Tags, "--tags")
	_, err := r.Runner.Run(ctx, command)
	return err
}
