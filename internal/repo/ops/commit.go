package ops

import (
	"context"
	"strings"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// CommitRequest describes a commit of the staged changes.
type CommitRequest struct {
	// Message is the full commit message: subject, blank line, body.
	Message string `json:"message"`
	// Amend replaces the last commit instead of adding a new one.
	Amend bool `json:"amend"`
	// NoVerify skips the pre-commit and commit-msg hooks.
	NoVerify bool `json:"noVerify"`
}

// Validate rejects an empty message.
func (request CommitRequest) Validate() error {
	if strings.TrimSpace(request.Message) == "" {
		return invalid("missing commit message; write a message describing the change")
	}
	return nil
}

// Commit records the staged changes. Repository hooks run as they do on the
// command line unless NoVerify is set; a failing hook is reported as
// git.HookFailed with the hook's output.
//
//	git commit [--amend] [--no-verify] -m <message>
func Commit(ctx context.Context, r *repo.Repository, request CommitRequest) error {
	command := git.Write("commit").
		ArgIf(request.Amend, "--amend").
		ArgIf(request.NoVerify, "--no-verify").
		Arg("-m", request.Message)
	_, err := r.Runner.Run(ctx, command)
	return err
}
