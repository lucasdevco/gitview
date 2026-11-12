package server

import (
	"context"
	"net/http"

	"gitview/internal/repo/query"
	"gitview/internal/workspace"
)

// getGraph answers GET /api/v1/repos/{repoId}/graph with the whole commit
// topology in scope.
//
// Query parameters: scope=all|current (default all) and remotes=true|false
// (default true; false leaves out commits reachable only from
// remote-tracking branches).
func (s *Server) getGraph(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	options := query.GraphOptions{Scope: query.ScopeAll, Remotes: true}
	switch scope := r.URL.Query().Get("scope"); scope {
	case "", "all":
	case "current":
		options.Scope = query.ScopeCurrent
	default:
		writeError(w, http.StatusBadRequest, "invalid_argument",
			`unknown scope "`+scope+`"; use scope=all for every branch or scope=current for the checked-out branch`)
		return
	}
	switch remotes := r.URL.Query().Get("remotes"); remotes {
	case "", "true":
	case "false":
		options.Remotes = false
	default:
		writeError(w, http.StatusBadRequest, "invalid_argument",
			`unknown remotes value "`+remotes+`"; use remotes=true or remotes=false`)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), readTimeout)
	defer cancel()
	commits, err := query.Graph(ctx, repo.Reader(), options)
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeData(w, commits)
}

// getRefs answers GET /api/v1/repos/{repoId}/refs with branches, remotes
// and tags.
func (s *Server) getRefs(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	ctx, cancel := context.WithTimeout(r.Context(), readTimeout)
	defer cancel()
	refs, err := query.ReadRefs(ctx, repo.Reader())
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeData(w, refs)
}
