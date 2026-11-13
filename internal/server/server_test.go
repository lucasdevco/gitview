package server_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"gitview/internal/gittest"
	"gitview/internal/server"
	"gitview/internal/workspace"
)

type fixture struct {
	handler http.Handler
	repoID  string
}

func newFixture(t *testing.T, r *gittest.Repo) fixture {
	t.Helper()
	ws := workspace.New()
	t.Cleanup(ws.Close)
	opened, err := ws.Open(context.Background(), r.Dir)
	if err != nil {
		t.Fatal(err)
	}
	api, err := server.New(ws)
	if err != nil {
		t.Fatal(err)
	}
	return fixture{handler: api.Handler(), repoID: opened.ID}
}

// get issues a same-origin request the way the frontend does.
func (f fixture) get(t *testing.T, path string, mutate ...func(*http.Request)) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080"+path, nil)
	for _, m := range mutate {
		m(request)
	}
	response := httptest.NewRecorder()
	f.handler.ServeHTTP(response, request)
	return response
}

func decode[T any](t *testing.T, response *httptest.ResponseRecorder) T {
	t.Helper()
	var body T
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode %q: %v", response.Body.String(), err)
	}
	return body
}

type repoSummary struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Branch   string `json:"branch"`
	Head     string `json:"head"`
	Empty    bool   `json:"empty"`
	Detached bool   `json:"detached"`
	State    string `json:"state"`
	// MergeMessage is the message git prepared while merging,
	// cherry-picking or reverting.
	MergeMessage string `json:"mergeMessage"`
	Identity     struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	} `json:"identity"`
}

type apiError struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func TestRepositorySummary(t *testing.T) {
	r := gittest.Init(t)
	head := r.Commit("README.md", "hello\n", "first")
	f := newFixture(t, r)

	response := f.get(t, "/api/v1/repos/"+f.repoID)
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	body := decode[struct{ Data repoSummary }](t, response)
	got := body.Data
	if got.ID != f.repoID || got.Name != filepath.Base(r.Dir) || got.Branch != "main" || got.Head != head ||
		got.Empty || got.Detached || got.State != "clean" ||
		got.Identity.Name != "Ada Lovelace" || got.Identity.Email != "ada@example.com" {
		t.Fatalf("unexpected summary: %+v", got)
	}
}

func TestEmptyRepositoryOpens(t *testing.T) {
	r := gittest.Init(t)
	f := newFixture(t, r)

	response := f.get(t, "/api/v1/repos/"+f.repoID)
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	got := decode[struct{ Data repoSummary }](t, response).Data
	if !got.Empty || got.Head != "" || got.Branch != "main" {
		t.Fatalf("unexpected summary: %+v", got)
	}
}

func TestListRepositories(t *testing.T) {
	r := gittest.Init(t)
	f := newFixture(t, r)

	response := f.get(t, "/api/v1/repos")
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	body := decode[struct {
		Data []struct{ ID, Name, Root string }
	}](t, response)
	if len(body.Data) != 1 || body.Data[0].ID != f.repoID || body.Data[0].Name != filepath.Base(r.Dir) || body.Data[0].Root != r.Dir {
		t.Fatalf("unexpected repositories: %+v", body.Data)
	}
}

func TestUnknownRepository(t *testing.T) {
	f := newFixture(t, gittest.Init(t))

	response := f.get(t, "/api/v1/repos/nope")
	if response.Code != http.StatusNotFound || decode[apiError](t, response).Error.Code != "repo_not_found" {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body)
	}
}

func TestUnknownAPIRoute(t *testing.T) {
	f := newFixture(t, gittest.Init(t))

	response := f.get(t, "/api/v1/overview")
	if response.Code != http.StatusNotFound || decode[apiError](t, response).Error.Code != "not_found" {
		t.Fatalf("unexpected response %d: %s", response.Code, response.Body)
	}
}

func TestRejectedRequests(t *testing.T) {
	f := newFixture(t, gittest.Init(t))
	cases := []struct {
		name   string
		mutate func(*http.Request)
		status int
		code   string
	}{
		{"foreign host (DNS rebinding)", func(r *http.Request) { r.Host = "evil.example:8080" }, http.StatusForbidden, "forbidden_host"},
		{"lan address host", func(r *http.Request) { r.Host = "192.168.1.10:8080" }, http.StatusForbidden, "forbidden_host"},
		{"cross-site origin", func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") }, http.StatusForbidden, "forbidden_origin"},
		{"other loopback port origin", func(r *http.Request) { r.Header.Set("Origin", "http://127.0.0.1:9999") }, http.StatusForbidden, "forbidden_origin"},
		{"opaque origin", func(r *http.Request) { r.Header.Set("Origin", "null") }, http.StatusForbidden, "forbidden_origin"},
		{"cross-site fetch metadata", func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "cross-site") }, http.StatusForbidden, "forbidden_origin"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			response := f.get(t, "/api/v1/repos/"+f.repoID, tc.mutate)
			if response.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", response.Code, tc.status, response.Body)
			}
			body := decode[apiError](t, response)
			if body.Error.Code != tc.code || body.Error.Message == "" {
				t.Fatalf("unexpected error body: %s", response.Body)
			}
			if strings.Contains(response.Body.String(), `"data"`) {
				t.Fatalf("rejected request leaked data: %s", response.Body)
			}
		})
	}
}

func TestAcceptedRequestVariants(t *testing.T) {
	f := newFixture(t, gittest.Init(t))
	cases := []struct {
		name   string
		mutate func(*http.Request)
	}{
		{"no headers (curl)", func(*http.Request) {}},
		{"same origin", func(r *http.Request) { r.Header.Set("Origin", "http://127.0.0.1:8080") }},
		{"localhost host", func(r *http.Request) {
			r.Host = "localhost:8080"
			r.Header.Set("Origin", "http://localhost:8080")
		}},
		{"ipv6 loopback host", func(r *http.Request) { r.Host = "[::1]:8080" }},
		{"same-origin fetch metadata", func(r *http.Request) { r.Header.Set("Sec-Fetch-Site", "same-origin") }},
		{"leftover token in a bookmarked URL is ignored", func(r *http.Request) { r.URL.RawQuery = "token=old" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			response := f.get(t, "/api/v1/repos/"+f.repoID, tc.mutate)
			if response.Code != http.StatusOK {
				t.Fatalf("status %d: %s", response.Code, response.Body)
			}
		})
	}
}

func TestAppPageReadsTheAPIWithoutCredentials(t *testing.T) {
	f := newFixture(t, gittest.Init(t))
	// What a browser sends for fetch() and EventSource from the gitview page.
	fromApp := func(r *http.Request) {
		r.Header.Set("Origin", "http://127.0.0.1:8080")
		r.Header.Set("Sec-Fetch-Site", "same-origin")
	}

	page := f.get(t, "/", fromApp)
	if page.Code != http.StatusOK || !strings.Contains(page.Body.String(), "<html") {
		t.Fatalf("unexpected page response %d", page.Code)
	}
	if page.Header().Get("Referrer-Policy") != "no-referrer" {
		t.Fatal("repository paths in page URLs must not leak through Referer")
	}
	repos := f.get(t, "/api/v1/repos", fromApp)
	if repos.Code != http.StatusOK {
		t.Fatalf("repos: status %d: %s", repos.Code, repos.Body)
	}
	if got := decode[struct{ Data []repoSummary }](t, repos).Data; len(got) != 1 || got[0].ID != f.repoID {
		t.Fatalf("repos = %+v", got)
	}
}

func TestPageLoadsOnlyOnLoopbackHosts(t *testing.T) {
	f := newFixture(t, gittest.Init(t))

	rebound := f.get(t, "/", func(r *http.Request) {
		r.Host = "evil.example"
	})
	if rebound.Code != http.StatusForbidden {
		t.Fatalf("expected forbidden for foreign host, got %d", rebound.Code)
	}
}
