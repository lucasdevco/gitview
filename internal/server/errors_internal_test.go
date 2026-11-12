package server

import (
	"net/http"
	"testing"

	"gitview/internal/git"
)

// Every kind of git failure the execution layer classifies is reported with
// its status and a remedy, so no failure reaches the user without advice.
func TestEveryGitErrorKindIsReportedWithARemedy(t *testing.T) {
	kinds := map[git.ErrorKind]int{
		git.NotInstalled:         http.StatusInternalServerError,
		git.NotRepository:        http.StatusInternalServerError,
		git.LockConflict:         http.StatusConflict,
		git.AuthenticationFailed: http.StatusBadGateway,
		git.Conflict:             http.StatusConflict,
		git.RefNotFound:          http.StatusNotFound,
		git.PushRejected:         http.StatusConflict,
		git.UnsupportedVersion:   http.StatusInternalServerError,
		git.HookFailed:           http.StatusUnprocessableEntity,
		git.LocalChanges:         http.StatusConflict,
		git.BranchNotMerged:      http.StatusConflict,
		git.NothingInProgress:    http.StatusConflict,
		git.Failed:               http.StatusInternalServerError,
	}
	for kind, wantStatus := range kinds {
		status, described := describeError(&git.Error{Kind: kind, Command: "git x", Stderr: "boom"})
		if status != wantStatus || described.Code != string(kind) || described.Hint == "" {
			t.Errorf("%s: status %d, %+v; want status %d with a hint", kind, status, described, wantStatus)
		}
	}
}
