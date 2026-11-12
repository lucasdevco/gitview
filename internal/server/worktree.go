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
	status, err := query.Status(ctx, repo.Repository)
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeData(w, status)
}

// getDiff answers GET /api/v1/repos/{repoId}/diff?source=&path=&oldPath=.
// source is staged, unstaged or untracked; oldPath is the original name of
// a staged rename.
func (s *Server) getDiff(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	ctx, cancel := context.WithTimeout(r.Context(), readTimeout)
	defer cancel()
	params := r.URL.Query()
	diff, err := query.Diff(ctx, repo.Repository, query.DiffRequest{
		Source:  query.DiffSource(params.Get("source")),
		Path:    params.Get("path"),
		OldPath: params.Get("oldPath"),
	})
	var invalid *query.InvalidRequestError
	if errors.As(err, &invalid) {
		writeError(w, http.StatusBadRequest, "invalid_request", invalid.Message)
		return
	}
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeData(w, diff)
}
