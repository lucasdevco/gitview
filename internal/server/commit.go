package server

import (
	"context"
	"net/http"

	"gitview/internal/repo/query"
	"gitview/internal/workspace"
)

// getCommit answers GET /api/v1/repos/{repoId}/commits/{oid} with the
// commit's message and the files it changed. oid is a full or abbreviated
// hexadecimal commit id.
func (s *Server) getCommit(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	ctx, cancel := context.WithTimeout(r.Context(), readTimeout)
	defer cancel()
	commit, err := query.Commit(ctx, repo.Repository, r.PathValue("oid"))
	if err != nil {
		writeQueryError(w, err)
		return
	}
	writeData(w, commit)
}
