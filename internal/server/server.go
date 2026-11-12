// Package server is gitview's local HTTP API and the delivery of the embedded
// frontend. Repository resources live under /api/v1/repos/{repoId}.
package server

import (
	"context"
	"encoding/json"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"

	"gitview/internal/repo/query"
	webassets "gitview/internal/web"
	"gitview/internal/workspace"
)

// readTimeout bounds a single read request.
const readTimeout = 30 * time.Second

// Server serves the API for the repositories in a workspace.
type Server struct {
	workspace *workspace.Workspace
	assets    http.Handler
	assetFS   fs.FS
}

// New returns a server for ws.
func New(ws *workspace.Workspace) (*Server, error) {
	assets, err := webassets.Assets()
	if err != nil {
		return nil, err
	}
	return &Server{workspace: ws, assets: http.FileServer(http.FS(assets)), assetFS: assets}, nil
}

// Handler returns the HTTP handler with security checks applied.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/events", s.streamEvents)
	mux.HandleFunc("GET /api/v1/repos", s.listRepos)
	mux.HandleFunc("GET /api/v1/repos/{repoId}", s.withRepo(s.getRepo))
	mux.HandleFunc("GET /api/v1/repos/{repoId}/status", s.withRepo(s.getStatus))
	mux.HandleFunc("GET /api/v1/repos/{repoId}/diff", s.withRepo(s.getDiff))
	mux.HandleFunc("GET /api/v1/repos/{repoId}/graph", s.withRepo(s.getGraph))
	mux.HandleFunc("GET /api/v1/repos/{repoId}/refs", s.withRepo(s.getRefs))
	mux.HandleFunc("GET /api/v1/repos/{repoId}/commits/{oid}", s.withRepo(s.getCommit))
	s.registerOperations(mux)
	s.registerStashes(mux)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "API endpoint not found")
	})
	mux.HandleFunc("/", s.spa)
	return securityHeaders(guard(mux))
}

// repoHandler handles a request for one open repository.
type repoHandler func(http.ResponseWriter, *http.Request, *workspace.Repo)

// withRepo resolves the {repoId} path segment, answering 404 when no such
// repository is open.
func (s *Server) withRepo(next repoHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("repoId")
		repo, ok := s.workspace.Repo(id)
		if !ok {
			writeError(w, http.StatusNotFound, "repo_not_found", "no open repository has id "+id)
			return
		}
		next(w, r, repo)
	}
}

type repoEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Root string `json:"root"`
}

func (s *Server) listRepos(w http.ResponseWriter, _ *http.Request) {
	entries := []repoEntry{}
	for _, r := range s.workspace.Repos() {
		entries = append(entries, repoEntry{ID: r.ID, Name: r.Name(), Root: r.Root})
	}
	writeData(w, entries)
}

func (s *Server) getRepo(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	ctx, cancel := context.WithTimeout(r.Context(), readTimeout)
	defer cancel()
	summary, err := query.Summarize(ctx, repo.Repository)
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeData(w, struct {
		ID string `json:"id"`
		query.Summary
	}{repo.ID, summary})
}

func writeData(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

// writeGitError reports a failed git command with its classified kind as the
// error code, git's own message and a hint on how to resolve it.
func writeGitError(w http.ResponseWriter, err error) {
	status, described := describeError(err)
	writeJSON(w, status, map[string]any{"error": described})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (s *Server) spa(w http.ResponseWriter, request *http.Request) {
	assetPath := strings.TrimPrefix(path.Clean(request.URL.Path), "/")
	if assetPath == "." || assetPath == "" {
		assetPath = "index.html"
	}
	if _, err := fs.Stat(s.assetFS, assetPath); err != nil {
		assetPath = "index.html"
	}
	if assetPath == "index.html" {
		w.Header().Set("Cache-Control", "no-cache")
		request.URL.Path = "/"
	} else if strings.Contains(path.Base(assetPath), ".") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		request.URL.Path = "/" + assetPath
	}
	s.assets.ServeHTTP(w, request)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}
