package server

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	functionanalysis "gitview/internal/function"
	"gitview/internal/overview"
	webassets "gitview/internal/web"
)

type OverviewService interface {
	Overview(context.Context, overview.Filters) (overview.Report, error)
	Contributor(context.Context, overview.Filters, string) (overview.ContributorReport, error)
	Files(context.Context, overview.Filters, string, int) (overview.FileReport, error)
	File(context.Context, overview.Filters, string) (overview.FileDetailReport, error)
	Compare(context.Context, overview.Filters, string, string) (overview.CompareReport, error)
	Explain(context.Context, string, string, *time.Location) (overview.ExplainReport, error)
}

type FunctionService interface {
	Functions(context.Context, overview.Filters, string, int) (functionanalysis.Report, error)
	Function(context.Context, overview.Filters, string) (functionanalysis.DetailReport, error)
}

type API struct {
	overview  OverviewService
	functions FunctionService
	assets    http.Handler
	assetFS   fs.FS
}

func New(overviewService OverviewService, functionServices ...FunctionService) (*API, error) {
	assets, err := webassets.Assets()
	if err != nil {
		return nil, err
	}
	api := &API{overview: overviewService, assets: http.FileServer(http.FS(assets)), assetFS: assets}
	if len(functionServices) > 0 {
		api.functions = functionServices[0]
	}
	return api, nil
}

func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", a.health)
	mux.HandleFunc("GET /api/v1/overview", a.getOverview)
	mux.HandleFunc("GET /api/v1/contributors/{id}", a.getContributor)
	mux.HandleFunc("GET /api/v1/hotspots", a.getHotspots)
	mux.HandleFunc("GET /api/v1/ownership", a.getOwnership)
	mux.HandleFunc("GET /api/v1/file", a.getFile)
	mux.HandleFunc("GET /api/v1/functions", a.getFunctions)
	mux.HandleFunc("GET /api/v1/functions/{id}", a.getFunction)
	mux.HandleFunc("GET /api/v1/compare", a.getCompare)
	mux.HandleFunc("GET /api/v1/explain", a.getExplain)
	mux.HandleFunc("/api/", notFound)
	mux.HandleFunc("/", a.spa)
	return securityHeaders(mux)
}

func (a *API) getCompare(w http.ResponseWriter, request *http.Request) {
	filters, err := parseFilters(request)
	if err != nil {
		writeFilterError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 30*time.Second)
	defer cancel()
	report, err := a.overview.Compare(ctx, filters, request.URL.Query().Get("from"), request.URL.Query().Get("to"))
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"schema_version": overview.SchemaVersion, "analysis_context": report.AnalysisContext, "warnings": report.Warnings, "data": map[string]any{"repository": report.Repository, "from_ref": report.FromRef, "to_ref": report.ToRef, "from_revision": report.FromRevision, "to_revision": report.ToRevision, "totals": report.Totals, "contributors": report.Contributors, "files": report.Files, "commits": report.Commits}})
}

func (a *API) getExplain(w http.ResponseWriter, request *http.Request) {
	pathFilter, err := overview.ParseFilters("", "", request.URL.Query().Get("path"), time.Local)
	if err != nil {
		writeFilterError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 30*time.Second)
	defer cancel()
	report, err := a.overview.Explain(ctx, pathFilter.Path, request.URL.Query().Get("month"), time.Local)
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"schema_version": overview.SchemaVersion, "analysis_context": report.AnalysisContext, "warnings": report.Warnings, "data": map[string]any{"repository": report.Repository, "month": report.Month, "totals": report.Totals, "contributors": report.Contributors, "paths": report.Paths, "commits": report.Commits, "insights": report.Insights}})
}

func (a *API) getFunctions(w http.ResponseWriter, request *http.Request) {
	if a.functions == nil {
		writeJSON(w, http.StatusNotImplemented, map[string]any{"error": map[string]string{"code": "function_analysis_unavailable", "message": "function analysis is unavailable"}})
		return
	}
	filters, err := parseFilters(request)
	if err != nil {
		writeFilterError(w, err)
		return
	}
	limit, err := parseLimit(request, 50)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]string{"code": "invalid_limit", "message": err.Error()}})
		return
	}
	sortBy := request.URL.Query().Get("sort")
	if sortBy == "" {
		sortBy = "hotspot"
	}
	if sortBy != "hotspot" && sortBy != "churn" && sortBy != "changes" && sortBy != "complexity" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]string{"code": "invalid_sort", "message": "sort must be hotspot, churn, changes, or complexity"}})
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 60*time.Second)
	defer cancel()
	report, err := a.functions.Functions(ctx, filters, sortBy, limit)
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"schema_version": overview.SchemaVersion, "analysis_context": report.AnalysisContext, "warnings": report.Warnings, "data": map[string]any{"repository": report.Repository, "functions": report.Functions, "analyzer_version": report.AnalyzerVersion}})
}

func (a *API) getFunction(w http.ResponseWriter, request *http.Request) {
	if a.functions == nil {
		writeJSON(w, http.StatusNotImplemented, map[string]any{"error": map[string]string{"code": "function_analysis_unavailable", "message": "function analysis is unavailable"}})
		return
	}
	filters, err := parseFilters(request)
	if err != nil {
		writeFilterError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 60*time.Second)
	defer cancel()
	report, err := a.functions.Function(ctx, filters, request.PathValue("id"))
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"schema_version": overview.SchemaVersion, "analysis_context": report.AnalysisContext, "warnings": report.Warnings, "data": map[string]any{"repository": report.Repository, "function": report.Function, "history": report.History, "analyzer_version": report.AnalyzerVersion}})
}

func (a *API) getHotspots(w http.ResponseWriter, request *http.Request) {
	a.getFiles(w, request, "hotspot")
}

func (a *API) getOwnership(w http.ResponseWriter, request *http.Request) {
	a.getFiles(w, request, "ownership")
}

func (a *API) getFiles(w http.ResponseWriter, request *http.Request, sortBy string) {
	filters, err := parseFilters(request)
	if err != nil {
		writeFilterError(w, err)
		return
	}
	limit, err := parseLimit(request, 20)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]string{"code": "invalid_limit", "message": err.Error()}})
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 30*time.Second)
	defer cancel()
	report, err := a.overview.Files(ctx, filters, sortBy, limit)
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"schema_version": overview.SchemaVersion, "analysis_context": report.AnalysisContext, "warnings": report.Warnings,
		"data": map[string]any{"repository": report.Repository, "files": report.Files, "recent_days": report.RecentDays},
	})
}

func parseLimit(request *http.Request, fallback int) (int, error) {
	raw := request.URL.Query().Get("limit")
	if raw == "" {
		return fallback, nil
	}
	limit, err := strconv.Atoi(raw)
	if err != nil || limit < 1 || limit > 200 {
		return 0, errors.New("limit must be between 1 and 200")
	}
	return limit, nil
}

func (a *API) getFile(w http.ResponseWriter, request *http.Request) {
	filters, err := parseFilters(request)
	if err != nil {
		writeFilterError(w, err)
		return
	}
	fileFilter, err := overview.ParseFilters("", "", request.URL.Query().Get("file"), time.Local)
	if err != nil || fileFilter.Path == "" {
		if err == nil {
			err = &overview.FilterError{Code: "invalid_file", Message: "file is required"}
		}
		writeFilterError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 30*time.Second)
	defer cancel()
	report, err := a.overview.File(ctx, filters, fileFilter.Path)
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"schema_version": overview.SchemaVersion, "analysis_context": report.AnalysisContext, "warnings": report.Warnings,
		"data": map[string]any{"repository": report.Repository, "file": report.File, "contributors": report.Contributors, "recent_commits": report.RecentCommits, "recent_days": report.RecentDays},
	})
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
	filters, err := parseFilters(request)
	if err != nil {
		writeFilterError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 30*time.Second)
	defer cancel()
	report, err := a.overview.Overview(ctx, filters)
	if err != nil {
		writeAnalysisError(w, err)
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

func (a *API) getContributor(w http.ResponseWriter, request *http.Request) {
	filters, err := parseFilters(request)
	if err != nil {
		writeFilterError(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(request.Context(), 30*time.Second)
	defer cancel()
	report, err := a.overview.Contributor(ctx, filters, request.PathValue("id"))
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"schema_version":   overview.SchemaVersion,
		"analysis_context": report.AnalysisContext,
		"warnings":         report.Warnings,
		"data": map[string]any{
			"repository":       report.Repository,
			"contributor":      report.Contributor,
			"monthly_activity": report.MonthlyActivity,
			"top_paths":        report.TopPaths,
			"recent_commits":   report.RecentCommits,
		},
	})
}

func parseFilters(request *http.Request) (overview.Filters, error) {
	query := request.URL.Query()
	return overview.ParseFilters(query.Get("since"), query.Get("until"), query.Get("path"), time.Local)
}

func writeFilterError(w http.ResponseWriter, err error) {
	var filterErr *overview.FilterError
	if errors.As(err, &filterErr) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]string{"code": filterErr.Code, "message": filterErr.Message}})
		return
	}
	writeJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]string{"code": "invalid_filter", "message": err.Error()}})
}

func writeAnalysisError(w http.ResponseWriter, err error) {
	code := "analysis_failed"
	status := http.StatusInternalServerError
	if errors.Is(err, context.DeadlineExceeded) {
		code = "analysis_timeout"
		status = http.StatusGatewayTimeout
	}
	var notFound *overview.NotFoundError
	if errors.As(err, &notFound) {
		code = notFound.Entity + "_not_found"
		status = http.StatusNotFound
	}
	var functionNotFound *functionanalysis.NotFoundError
	if errors.As(err, &functionNotFound) {
		code = "function_not_found"
		status = http.StatusNotFound
	}
	var filterErr *overview.FilterError
	if errors.As(err, &filterErr) {
		writeFilterError(w, err)
		return
	}
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": err.Error()}})
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
