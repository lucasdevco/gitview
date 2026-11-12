package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"gitview/internal/repo/query"
	"gitview/internal/workspace"
)

func (s *Server) registerStashes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/repos/{repoId}/stashes", s.withRepo(s.listStashes))
	mux.HandleFunc("GET /api/v1/repos/{repoId}/stashes/{index}", s.withRepo(s.getStash))
}

// listStashes answers GET /api/v1/repos/{repoId}/stashes: the stash list,
// newest first.
func (s *Server) listStashes(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	ctx, cancel := context.WithTimeout(r.Context(), readTimeout)
	defer cancel()
	stashes, err := query.Stashes(ctx, repo.Repository)
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeData(w, stashes)
}

// getStash answers GET /api/v1/repos/{repoId}/stashes/{index} with the stash
// at index (0 is stash@{0}) and the files it saved. Each file's diff is
// GET .../diff?source=stash&commit=<stash oid>&path=<path>.
func (s *Server) getStash(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	ctx, cancel := context.WithTimeout(r.Context(), readTimeout)
	defer cancel()
	raw := r.PathValue("index")
	index, err := strconv.Atoi(raw)
	if err != nil || index < 0 {
		writeError(w, http.StatusBadRequest, "invalid_request",
			fmt.Sprintf("stash index %q is not a number; pass 0 for stash@{0}, 1 for stash@{1}, ...", raw))
		return
	}
	stash, err := query.StashFiles(ctx, repo.Repository, index)
	var missing *query.StashNotFoundError
	switch {
	case errors.As(err, &missing):
		writeError(w, http.StatusNotFound, "stash_not_found", missing.Error())
	case err != nil:
		writeQueryError(w, err)
	default:
		writeData(w, stash)
	}
}
