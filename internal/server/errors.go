package server

import (
	"context"
	"errors"
	"net/http"

	"gitview/internal/git"
	"gitview/internal/repo/ops"
)

// gitFailure is how the API reports one kind of git failure: the HTTP
// status, and a hint saying how to resolve it. The message beside the hint
// is git's own account of what went wrong.
type gitFailure struct {
	status int
	hint   string
}

// gitFailures has an entry for every git.ErrorKind. It is the only place
// that decides a git failure's status and remedy; the frontend translates
// the hint by the kind, which is the API error code.
var gitFailures = map[git.ErrorKind]gitFailure{
	git.NotInstalled: {http.StatusInternalServerError,
		"install git (version 2.32 or newer) and make sure it is on the PATH of the gitview process, then restart gitview"},
	git.UnsupportedVersion: {http.StatusInternalServerError,
		"upgrade git to version 2.32 or newer, then restart gitview"},
	git.NotRepository: {http.StatusInternalServerError,
		"the folder is no longer a git repository, perhaps it was moved or deleted; restart gitview with the repository's current path"},
	git.LockConflict: {http.StatusConflict,
		"another git process is using the repository; wait for it to finish and try again, or delete .git/index.lock if no git process is running"},
	git.AuthenticationFailed: {http.StatusBadGateway,
		"the remote did not accept the credentials; check the user name and password or token, or the SSH key, and try again"},
	git.Conflict: {http.StatusConflict,
		"resolve the conflicted files and mark them resolved, then continue; or abort to return to where you started"},
	git.RefNotFound: {http.StatusNotFound,
		"the branch, tag or commit does not exist (any more); refresh and choose an existing one"},
	git.PushRejected: {http.StatusConflict,
		"the remote has commits that your branch does not (or a remote hook refused the push); pull first, then push again"},
	git.HookFailed: {http.StatusUnprocessableEntity,
		"a repository hook stopped the operation; fix what the hook reports and try again, or skip hooks for this commit"},
	git.LocalChanges: {http.StatusConflict,
		"uncommitted changes are in the way; commit or stash them, then try again"},
	git.BranchNotMerged: {http.StatusConflict,
		"the branch has commits that are not merged anywhere else; merge them first, or delete it with force if they are no longer needed"},
	git.NothingInProgress: {http.StatusConflict,
		"there is no merge, rebase, cherry-pick or revert to abort; it was probably concluded or aborted elsewhere, refresh to see the current state"},
	git.Failed: {http.StatusInternalServerError,
		"git failed; read its output for the reason, fix it and try again"},
}

// apiError is an API error response body: what went wrong (Message), how to
// resolve it (Hint, when the message does not already say), and for a git
// failure what git printed (Output).
type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Hint    string `json:"hint,omitempty"`
	// Output is what git printed about the failure; absent when git did not
	// fail.
	Output *string `json:"output,omitempty"`
}

// describeError maps an error to its HTTP status and API error. A git
// failure's code is its classified kind.
func describeError(err error) (int, apiError) {
	var gitErr *git.Error
	var invalid *ops.InvalidRequestError
	switch {
	case errors.As(err, &invalid):
		return http.StatusBadRequest, apiError{Code: "invalid_request", Message: invalid.Message}
	case errors.As(err, &gitErr):
		known, ok := gitFailures[gitErr.Kind]
		if !ok {
			known = gitFailures[git.Failed]
		}
		output := gitErr.Output()
		return known.status, apiError{Code: string(gitErr.Kind), Message: gitErr.Error(), Hint: known.hint, Output: &output}
	case errors.Is(err, context.DeadlineExceeded):
		return http.StatusGatewayTimeout, apiError{Code: "timeout", Message: "git did not answer in time; try again"}
	case errors.Is(err, context.Canceled):
		return http.StatusServiceUnavailable, apiError{Code: "canceled", Message: "the request was canceled before it started"}
	default:
		return http.StatusInternalServerError, apiError{Code: "internal", Message: err.Error()}
	}
}
