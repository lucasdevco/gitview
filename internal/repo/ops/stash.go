package ops

import (
	"context"
	"errors"
	"strings"

	"gitview/internal/git"
	"gitview/internal/repo"
	"gitview/internal/repo/query"
)

// StashPushRequest describes stashing the working tree's changes.
type StashPushRequest struct {
	// Message describes the stash; git writes "WIP on <branch>: ..." when
	// it is empty.
	Message string `json:"message"`
	// KeepIndex leaves the staged changes in the index and working tree
	// while still saving them in the stash.
	KeepIndex bool `json:"keepIndex"`
}

// Validate accepts every stash push request; whether there is anything to
// stash is up to the working tree.
func (StashPushRequest) Validate() error { return nil }

// StashPush saves every change in the working tree, untracked files included
// (as Sourcetree does), and returns it to a clean state.
//
//	git stash push --include-untracked [--keep-index] [-m <message>]
func StashPush(ctx context.Context, r *repo.Repository, request StashPushRequest) error {
	message := strings.TrimSpace(request.Message)
	command := git.Write("stash", "push", "--include-untracked").
		ArgIf(request.KeepIndex, "--keep-index").
		ArgIf(message != "", "-m", message)
	result, err := r.Runner.Run(ctx, command)
	if err != nil {
		return err
	}
	// git exits 0 without creating a stash when there is nothing to save.
	if strings.Contains(string(result.Stdout)+string(result.Stderr), "No local changes to save") {
		return invalid("no local changes to stash; the working tree is already clean")
	}
	return nil
}

// StashRequest names one stash. Oid must be the stash's commit as listed, so
// a stash list that changed since it was read cannot make the operation act
// on another stash.
type StashRequest struct {
	// Index is the stash's position: 0 for stash@{0}, the newest.
	Index int `json:"index"`
	// Oid is the stash's commit id from the stash list.
	Oid string `json:"oid"`
}

// Validate rejects a request without the stash's oid. Whether the index
// names that stash is checked when it is applied or dropped.
func (request StashRequest) Validate() error {
	if request.Oid == "" {
		return invalid("missing oid; pass the stash's oid from the stash list")
	}
	return nil
}

// StashApply applies a stash to the working tree and keeps it in the list.
// Changes that conflict with the working tree are reported as git.Conflict
// and left as conflicted files.
//
//	git stash apply stash@{<index>}
func StashApply(ctx context.Context, r *repo.Repository, request StashRequest) error {
	name, err := verifyStash(ctx, r, request)
	if err != nil {
		return err
	}
	_, err = r.Runner.Run(ctx, git.Write("stash", "apply", name))
	return err
}

// StashDrop deletes a stash. Its changes cannot be recovered from gitview
// afterwards.
//
//	git stash drop stash@{<index>}
func StashDrop(ctx context.Context, r *repo.Repository, request StashRequest) error {
	name, err := verifyStash(ctx, r, request)
	if err != nil {
		return err
	}
	_, err = r.Runner.Run(ctx, git.Write("stash", "drop", name))
	return err
}

// verifyStash checks that the stash at request.Index is still request.Oid
// and returns its name, e.g. "stash@{0}".
func verifyStash(ctx context.Context, r *repo.Repository, request StashRequest) (string, error) {
	stash, err := query.FindStash(ctx, r, request.Index)
	var invalidQuery *query.InvalidRequestError
	var notFound *query.StashNotFoundError
	switch {
	case errors.As(err, &invalidQuery):
		return "", invalid("%s", invalidQuery.Message)
	case errors.As(err, &notFound):
		return "", invalid("%s", notFound.Error())
	case err != nil:
		return "", err
	}
	if stash.Oid != request.Oid {
		return "", invalid("stash@{%d} is no longer the stash you selected; the stash list changed, refresh it and try again", request.Index)
	}
	return stash.Name, nil
}
