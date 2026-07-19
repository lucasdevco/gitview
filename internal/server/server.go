package server

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"

	"gitview/internal/overview"
	webassets "gitview/internal/web"
)

type OverviewService interface {
	Overview(context.Context) (overview.Report, error)
}

type API struct {
	overview OverviewService
	assets   http.Handler
	assetFS  fs.FS
}

func New(overviewService OverviewService) (*API, error) {
	assets, err := webassets.Assets()
	if err != nil {
		return nil, err
	}
	return &API{overview: overviewService, assets: http.FileServer(http.FS(assets)), assetFS: assets}, nil
}

func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", a.health)
	mux.HandleFunc("GET /api/v1/overview", a.getOverview)
	mux.HandleFunc("/api/", notFound)
	mux.HandleFunc("/", a.spa)
	return securityHeaders(mux)
}

func notFound(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusNotFound, map[string]any{
		"error": map[string]string{"code": "not_found", "message": "API endpoint not found"},
	})
}

func (a *API) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *API) getOverview(w http.ResponseWriter, request *http.Request) {
	ctx, cancel := context.WithTimeout(request.Context(), 30*time.Second)
	defer cancel()
	report, err := a.overview.Overview(ctx)
	if err != nil {
		code := "analysis_failed"
		status := http.StatusInternalServerError
		if errors.Is(err, context.DeadlineExceeded) {
			code = "analysis_timeout"
			status = http.StatusGatewayTimeout
		}
		writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": err.Error()}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"schema_version":   overview.SchemaVersion,
		"analysis_context": report.AnalysisContext,
		"warnings":         report.Warnings,
		"data": map[string]any{
			"repository":       report.Repository,
			"totals":           report.Totals,
			"monthly_activity": report.MonthlyActivity,
			"contributors":     report.Contributors,
			"recent_commits":   report.RecentCommits,
		},
	})
}

func (a *API) spa(w http.ResponseWriter, request *http.Request) {
	assetPath := strings.TrimPrefix(path.Clean(request.URL.Path), "/")
	if assetPath == "." || assetPath == "" {
		assetPath = "index.html"
	}
	if _, err := fs.Stat(a.assetFS, assetPath); err != nil {
		assetPath = "index.html"
	}
	if assetPath == "index.html" {
		w.Header().Set("Cache-Control", "no-cache")
		request.URL.Path = "/"
	} else if strings.Contains(path.Base(assetPath), ".") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		request.URL.Path = "/" + assetPath
	}
	a.assets.ServeHTTP(w, request)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'")
		next.ServeHTTP(w, r)
	})
}
