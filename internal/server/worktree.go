package server

import (
	"context"
	"errors"
	"net/http"

	"gitview/internal/repo/query"
	"gitview/internal/workspace"
)

// getStatus answers GET /api/v1/repos/{repoId}/status.
func (s *Server) getStatus(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	ctx, cancel := context.WithTimeout(r.Context(), readTimeout)
	defer cancel()
	status, err := query.Status(ctx, repo.Reader())
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeData(w, status)
}

// writeQueryError reports a failed read query: a bad request, a missing
// commit or a git failure.
func writeQueryError(w http.ResponseWriter, err error) {
	var invalid *query.InvalidRequestError
	var missing *query.CommitNotFoundError
	switch {
	case errors.As(err, &invalid):
		writeError(w, http.StatusBadRequest, "invalid_request", invalid.Message)
	case errors.As(err, &missing):
		writeError(w, http.StatusNotFound, "commit_not_found", missing.Error())
	default:
		writeGitError(w, err)
	}
}

// getDiff answers GET /api/v1/repos/{repoId}/diff?source=&path=&oldPath=&commit=.
// source is staged, unstaged, untracked, commit or stash; oldPath is the
// original name of a renamed file; commit is the commit id for source=commit
// or the stash's oid for source=stash.
func (s *Server) getDiff(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	ctx, cancel := context.WithTimeout(r.Context(), readTimeout)
	defer cancel()
	params := r.URL.Query()
	diff, err := query.Diff(ctx, repo.Reader(), query.DiffRequest{
		Source:  query.DiffSource(params.Get("source")),
		Path:    params.Get("path"),
		OldPath: params.Get("oldPath"),
		Commit:  params.Get("commit"),
	})
	if err != nil {
		writeQueryError(w, err)
		return
	}
	writeData(w, diff)
}
