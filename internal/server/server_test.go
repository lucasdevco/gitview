package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	functionanalysis "gitview/internal/function"
	"gitview/internal/overview"
)

type fakeOverview struct {
	report  overview.Report
	filters *overview.Filters
	err     error
}

type fakeFunctions struct{ err error }

func (f fakeOverview) Branches(context.Context, string, int) (overview.BranchReport, error) {
	if f.err != nil {
		return overview.BranchReport{}, f.err
	}
	return overview.BranchReport{Branches: []overview.BranchRef{{Name: "main", OID: "abc", Current: true}}, Commits: []overview.BranchCommit{{OID: "abc", Parents: []string{}, Subject: "Initial commit", Refs: []string{"main"}}}}, nil
}

func (f fakeOverview) Directories(context.Context, string) ([]string, error) {
	if f.err != nil {
		return nil, f.err
	}
	return []string{"frontend", "internal"}, nil
}

func (f fakeOverview) Commit(context.Context, string) (overview.CommitReviewReport, error) {
	if f.err != nil {
		return overview.CommitReviewReport{}, f.err
	}
	return overview.CommitReviewReport{Commit: overview.CommitReview{OID: "abc", Subject: "Improve parser", Patch: "+new\n"}}, nil
}

func (f fakeFunctions) Functions(context.Context, overview.Filters, string, int) (functionanalysis.Report, error) {
	if f.err != nil {
		return functionanalysis.Report{}, f.err
	}
	return functionanalysis.Report{Functions: []functionanalysis.Metric{{ID: "fn-1", QualifiedName: "Parse"}}, AnalyzerVersion: functionanalysis.AnalyzerVersion}, nil
}
func (f fakeFunctions) Function(context.Context, overview.Filters, string) (functionanalysis.DetailReport, error) {
	if f.err != nil {
		return functionanalysis.DetailReport{}, f.err
	}
	return functionanalysis.DetailReport{Function: functionanalysis.Metric{ID: "fn-1", QualifiedName: "Parse"}, History: []functionanalysis.Change{{OID: "abc"}}, AnalyzerVersion: functionanalysis.AnalyzerVersion}, nil
}

func (f fakeOverview) Overview(_ context.Context, filters overview.Filters) (overview.Report, error) {
	if f.filters != nil {
		*f.filters = filters
	}
	return f.report, f.err
}

func (f fakeOverview) Contributor(_ context.Context, filters overview.Filters, _ string) (overview.ContributorReport, error) {
	if f.filters != nil {
		*f.filters = filters
	}
	if f.err != nil {
		return overview.ContributorReport{}, f.err
	}
	return overview.ContributorReport{Contributor: overview.Contributor{ID: "person-1", Name: "Ada"}}, nil
}

func (f fakeOverview) Files(context.Context, overview.Filters, string, int) (overview.FileReport, error) {
	if f.err != nil {
		return overview.FileReport{}, f.err
	}
	return overview.FileReport{Files: []overview.FileMetric{{Path: "internal/a.go"}}, RecentDays: 180}, nil
}

func (f fakeOverview) File(context.Context, overview.Filters, string) (overview.FileDetailReport, error) {
	if f.err != nil {
		return overview.FileDetailReport{}, f.err
	}
	return overview.FileDetailReport{File: overview.FileMetric{Path: "internal/a.go"}, RecentDays: 180}, nil
}
func (f fakeOverview) Compare(context.Context, overview.Filters, string, string) (overview.CompareReport, error) {
	if f.err != nil {
		return overview.CompareReport{}, f.err
	}
	return overview.CompareReport{FromRef: "v1", ToRef: "v2", Totals: overview.Totals{Commits: 2}}, nil
}
func (f fakeOverview) Explain(context.Context, string, string, *time.Location) (overview.ExplainReport, error) {
	if f.err != nil {
		return overview.ExplainReport{}, f.err
	}
	return overview.ExplainReport{Month: "2026-06", Insights: []overview.Insight{{Title: "Monthly activity"}}}, nil
}

func TestAPIReturnsStableTimeoutError(t *testing.T) {
	api, err := New(fakeOverview{err: context.DeadlineExceeded})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/overview", nil)
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusGatewayTimeout || !strings.Contains(response.Body.String(), `"code":"analysis_timeout"`) {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body.String())
	}
}

func TestAPI(t *testing.T) {
	api, err := New(fakeOverview{report: overview.Report{Repository: overview.Repository{Name: "sample"}}})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/overview", nil)
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}
	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["schema_version"] != overview.SchemaVersion {
		t.Fatalf("unexpected schema: %+v", payload)
	}
}

func TestPathsAPI(t *testing.T) {
	api, err := New(fakeOverview{})
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/paths?parent=internal", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"directories":["frontend","internal"]`) {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body.String())
	}
}

func TestBranchesAPI(t *testing.T) {
	api, err := New(fakeOverview{})
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/branches", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"name":"main"`) || !strings.Contains(response.Body.String(), `"subject":"Initial commit"`) {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body.String())
	}
}

func TestPathsAPIRejectsOutsideRepository(t *testing.T) {
	api, err := New(fakeOverview{})
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/paths?parent=../outside", nil))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "invalid_path") {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body.String())
	}
}

func TestCommitAPI(t *testing.T) {
	api, err := New(fakeOverview{})
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/commits/abc", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "Improve parser") {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body.String())
	}
}

func TestAPIParsesOverviewFilters(t *testing.T) {
	var filters overview.Filters
	api, err := New(fakeOverview{filters: &filters})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/overview?since=2026-01-01&until=2026-01-31&path=internal%2Fparser", nil)
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", response.Code, response.Body.String())
	}
	if filters.Since != "2026-01-01" || filters.Until != "2026-01-31" || filters.Path != "internal/parser" {
		t.Fatalf("unexpected filters: %+v", filters)
	}
}

func TestAPIRejectsInvalidOverviewFilters(t *testing.T) {
	api, err := New(fakeOverview{})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/overview?since=2026-02-01&until=2026-01-01", nil)
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), `"code":"invalid_date_range"`) {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body.String())
	}
}

func TestContributorAPI(t *testing.T) {
	api, err := New(fakeOverview{})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/contributors/person-1?path=internal", nil)
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"name":"Ada"`) {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body.String())
	}
}

func TestContributorAPINotFound(t *testing.T) {
	api, err := New(fakeOverview{err: &overview.NotFoundError{Entity: "contributor"}})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/contributors/missing", nil)
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusNotFound || !strings.Contains(response.Body.String(), `"code":"contributor_not_found"`) {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body.String())
	}
}

func TestHotspotsAndFileAPI(t *testing.T) {
	api, err := New(fakeOverview{})
	if err != nil {
		t.Fatal(err)
	}
	for _, target := range []string{"/api/v1/hotspots?limit=10", "/api/v1/ownership", "/api/v1/file?file=internal%2Fa.go"} {
		response := httptest.NewRecorder()
		api.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, target, nil))
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "internal/a.go") {
			t.Fatalf("%s: unexpected response %d: %s", target, response.Code, response.Body.String())
		}
	}
}

func TestHotspotsRejectInvalidLimit(t *testing.T) {
	api, err := New(fakeOverview{})
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/hotspots?limit=0", nil))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "invalid_limit") {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body.String())
	}
}

func TestFunctionAPIs(t *testing.T) {
	api, err := New(fakeOverview{}, fakeFunctions{})
	if err != nil {
		t.Fatal(err)
	}
	for _, target := range []string{"/api/v1/functions?sort=complexity&limit=10", "/api/v1/functions/fn-1"} {
		response := httptest.NewRecorder()
		api.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, target, nil))
		if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "Parse") {
			t.Fatalf("%s: unexpected response %d: %s", target, response.Code, response.Body.String())
		}
	}
}

func TestFunctionAPIRejectsInvalidSort(t *testing.T) {
	api, err := New(fakeOverview{}, fakeFunctions{})
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/functions?sort=unknown", nil))
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "invalid_sort") {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body.String())
	}
}

func TestCompareAndExplainAPIs(t *testing.T) {
	api, err := New(fakeOverview{})
	if err != nil {
		t.Fatal(err)
	}
	for _, target := range []string{"/api/v1/compare?from=v1&to=v2", "/api/v1/explain?month=2026-06"} {
		response := httptest.NewRecorder()
		api.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, target, nil))
		if response.Code != http.StatusOK {
			t.Fatalf("%s: unexpected response %d: %s", target, response.Code, response.Body.String())
		}
	}
}

func TestSPAFallback(t *testing.T) {
	api, err := New(fakeOverview{})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/deep/link", nil)
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "no-cache" {
		t.Fatalf("unexpected response: %d %+v", response.Code, response.Header())
	}
}

func TestUnknownAPIDoesNotFallBackToSPA(t *testing.T) {
	api, err := New(fakeOverview{})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/missing", nil)
	response := httptest.NewRecorder()
	api.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusNotFound || response.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("unexpected response: %d %+v", response.Code, response.Header())
	}
}
