package server

import (
	"context"
	"net/http"
	"strings"

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
	options, ok := graphOptions(w, r)
	if !ok {
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

// searchCommits answers GET /api/v1/repos/{repoId}/search?q=<text> with the
// oids of the commits whose full message, body included, contains text
// (ignoring case), newest first. It takes the graph's scope and remotes
// parameters; the graph itself carries only subjects.
func (s *Server) searchCommits(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	options, ok := graphOptions(w, r)
	if !ok {
		return
	}
	text := strings.TrimSpace(r.URL.Query().Get("q"))
	if text == "" {
		writeError(w, http.StatusBadRequest, "invalid_argument", "missing q; pass the text to look for in commit messages, e.g. ?q=login")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), readTimeout)
	defer cancel()
	oids, err := query.SearchMessages(ctx, repo.Reader(), options, text)
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeData(w, oids)
}

// getSubmodules answers GET /api/v1/repos/{repoId}/submodules with each
// submodule's path and the commit the index records for it.
func (s *Server) getSubmodules(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	ctx, cancel := context.WithTimeout(r.Context(), readTimeout)
	defer cancel()
	submodules, err := query.Submodules(ctx, repo.Reader())
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeData(w, submodules)
}

// graphOptions reads the scope and remotes parameters shared by the graph
// and search, answering 400 for an unknown value.
func graphOptions(w http.ResponseWriter, r *http.Request) (query.GraphOptions, bool) {
	options := query.GraphOptions{Scope: query.ScopeAll, Remotes: true}
	switch scope := r.URL.Query().Get("scope"); scope {
	case "", "all":
	case "current":
		options.Scope = query.ScopeCurrent
	default:
		writeError(w, http.StatusBadRequest, "invalid_argument",
			`unknown scope "`+scope+`"; use scope=all for every branch or scope=current for the checked-out branch`)
		return options, false
	}
	switch remotes := r.URL.Query().Get("remotes"); remotes {
	case "", "true":
	case "false":
		options.Remotes = false
	default:
		writeError(w, http.StatusBadRequest, "invalid_argument",
			`unknown remotes value "`+remotes+`"; use remotes=true or remotes=false`)
		return options, false
	}
	return options, true
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
