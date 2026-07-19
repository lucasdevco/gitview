package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gitview/internal/overview"
)

type fakeOverview struct{ report overview.Report }

func (f fakeOverview) Overview(context.Context) (overview.Report, error) { return f.report, nil }

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
