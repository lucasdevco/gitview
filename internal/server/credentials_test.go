package server_test

// Credential prompts end to end: git pushes over HTTP to a server that
// demands basic auth, runs the test binary as gitview's credential helper
// (see TestMain), and the helper calls the gitview API back over loopback.
// These tests listen on loopback ports.

import (
	"context"
	"io/fs"
	"net/http"
	"net/http/cgi"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gitview/internal/gittest"
	"gitview/internal/server"
	"gitview/internal/workspace"
)

type jobPrompt struct {
	ID     string `json:"id"`
	Text   string `json:"text"`
	Secret bool   `json:"secret"`
}

const (
	remoteUser     = "ada"
	remotePassword = "correct-horse-battery-staple"
)

// isolateGitConfig keeps the developer's credential helpers (such as the
// macOS keychain) out of the test: they would answer, or store, the test's
// credentials.
func isolateGitConfig(t *testing.T) {
	t.Helper()
	empty := filepath.Join(t.TempDir(), "gitconfig")
	if err := os.WriteFile(empty, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GIT_CONFIG_GLOBAL", empty)
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
}

// authenticatedRemote serves origin over smart HTTP, accepting only
// remoteUser with remotePassword, and returns its URL.
func authenticatedRemote(t *testing.T, origin *gittest.Repo) string {
	t.Helper()
	gitPath, err := exec.LookPath("git")
	if err != nil {
		t.Fatal(err)
	}
	backend := &cgi.Handler{
		Path: gitPath,
		Args: []string{"http-backend"},
		Env: []string{
			"GIT_PROJECT_ROOT=" + filepath.Dir(origin.Dir),
			"GIT_HTTP_EXPORT_ALL=1",
			"REMOTE_USER=" + remoteUser, // enables receive-pack
		},
	}
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, password, ok := r.BasicAuth()
		if !ok || user != remoteUser || password != remotePassword {
			w.Header().Set("WWW-Authenticate", `Basic realm="test"`)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		backend.ServeHTTP(w, r)
	}))
	t.Cleanup(remote.Close)
	return remote.URL + "/" + filepath.Base(origin.Dir)
}

// newServedFixture is newFixture with the API also listening on loopback
// and the test binary as the workspace's credential helper.
func newServedFixture(t *testing.T, r *gittest.Repo) fixture {
	t.Helper()
	ws := workspace.New()
	t.Cleanup(ws.Close)
	opened, err := ws.Open(context.Background(), r.Dir)
	if err != nil {
		t.Fatal(err)
	}
	api, err := server.New(ws, token)
	if err != nil {
		t.Fatal(err)
	}
	served := httptest.NewServer(api.Handler())
	t.Cleanup(served.Close)
	program, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	ws.UseCredentialHelper(workspace.CredentialHelper{Program: program, URL: served.URL + server.AskpassPath})
	return fixture{handler: api.Handler(), repoID: opened.ID}
}

// pushSetup is a local repository with one commit to push to an origin
// that needs credentials.
func pushSetup(t *testing.T) (remoteSetup, fixture, string) {
	t.Helper()
	isolateGitConfig(t)
	s := newRemoteSetup(t)
	s.local.Git("remote", "set-url", "origin", authenticatedRemote(t, s.origin))
	tip := s.local.Commit("a.txt", "two\n", "second")
	return s, newServedFixture(t, s.local), tip
}

func (f fixture) startPush(t *testing.T) job {
	t.Helper()
	return f.startJob(t, "push", map[string]any{
		"remote":   "origin",
		"branches": []map[string]any{{"local": "main", "remote": "main"}},
	})
}

// waitPrompt waits until the job asks a prompt other than previous.
func (f fixture) waitPrompt(t *testing.T, id, previous string) jobPrompt {
	t.Helper()
	deadline := time.Now().Add(jobDeadline)
	for {
		current := f.job(t, id)
		if current.Prompt != nil && current.Prompt.ID != previous {
			return *current.Prompt
		}
		if finished(current.State) || time.Now().After(deadline) {
			t.Fatalf("job %s asked nothing: %+v", id, current)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func (f fixture) answerPrompt(t *testing.T, jobID, promptID string, answer any) {
	t.Helper()
	response := f.post(t, "/api/v1/repos/"+f.repoID+"/jobs/"+jobID+"/prompt", map[string]any{"promptId": promptID, "answer": answer})
	if response.Code != http.StatusOK {
		t.Fatalf("answer: status %d: %s", response.Code, response.Body)
	}
}

func TestPushAsksForCredentialsInTheBrowserAndKeepsThemNowhere(t *testing.T) {
	s, f, tip := pushSetup(t)
	stream := f.subscribe(t)

	started := f.startPush(t)
	user := f.waitPrompt(t, started.ID, "")
	if !strings.HasPrefix(user.Text, "Username for 'http://127.0.0.1:") || user.Secret {
		t.Fatalf("first prompt = %+v, want a visible user name prompt", user)
	}
	f.answerPrompt(t, started.ID, user.ID, remoteUser)
	password := f.waitPrompt(t, started.ID, user.ID)
	if !strings.HasPrefix(password.Text, "Password for 'http://ada@127.0.0.1:") || !password.Secret {
		t.Fatalf("second prompt = %+v, want a hidden password prompt", password)
	}
	f.answerPrompt(t, started.ID, password.ID, remotePassword)
	done := f.waitJob(t, started.ID)

	if done.State != "succeeded" || done.Prompt != nil {
		t.Fatalf("push: %+v", done)
	}
	if got := s.origin.Git("rev-parse", "main"); got != tip {
		t.Fatalf("origin main = %s, want %s", got, tip)
	}
	// The prompts reached the event stream; the answers did not.
	updates := stream.untilFinished(t, started.ID)
	prompted := 0
	for _, update := range updates {
		if update.Prompt != nil {
			prompted++
		}
	}
	if prompted != 2 {
		t.Fatalf("job.updated events carried %d prompts, want 2: %+v", prompted, updates)
	}
	// The password is in no API response, the command log, or any file of
	// the repository.
	for _, path := range []string{"/jobs", "/jobs/" + started.ID, "/commands"} {
		if body := f.get(t, "/api/v1/repos/"+f.repoID+path).Body.String(); strings.Contains(body, remotePassword) {
			t.Fatalf("%s reveals the password: %s", path, body)
		}
	}
	err := filepath.WalkDir(s.local.Dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		content, err := os.ReadFile(path)
		if err == nil && strings.Contains(string(content), remotePassword) {
			t.Errorf("%s contains the password", path)
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestDecliningACredentialPromptFailsTheJobAsAuthenticationFailed(t *testing.T) {
	s, f, _ := pushSetup(t)
	before := s.origin.Git("rev-parse", "main")

	started := f.startPush(t)
	user := f.waitPrompt(t, started.ID, "")
	f.answerPrompt(t, started.ID, user.ID, nil)
	done := f.waitJob(t, started.ID)

	if done.State != "failed" || done.Error == nil || done.Error.Code != "authentication_failed" {
		t.Fatalf("push: %+v", done)
	}
	if got := s.origin.Git("rev-parse", "main"); got != before {
		t.Fatalf("origin main moved to %s", got)
	}
	// The prompt is closed: answering it again is refused.
	response := f.post(t, "/api/v1/repos/"+f.repoID+"/jobs/"+started.ID+"/prompt", map[string]any{"promptId": user.ID, "answer": "late"})
	if response.Code != http.StatusConflict || decode[jobResponse](t, response).Error.Code != "prompt_closed" {
		t.Fatalf("late answer: status %d: %s", response.Code, response.Body)
	}
}

func TestCancelingAJobWaitingForCredentialsStopsItAtOnce(t *testing.T) {
	_, f, _ := pushSetup(t)

	started := f.startPush(t)
	f.waitPrompt(t, started.ID, "")
	canceledAt := time.Now()
	f.cancelJob(t, started.ID)
	done := f.waitJob(t, started.ID)

	if done.State != "canceled" || done.Prompt != nil {
		t.Fatalf("job = %+v", done)
	}
	if took := time.Since(canceledAt); took > 3*time.Second {
		t.Fatalf("cancel took %s", took)
	}
}

func TestAskpassCallbackNeedsARunningJobsSecretFromLoopback(t *testing.T) {
	r := gittest.Init(t)
	f := newFixture(t, r)
	fromLoopback := func(request *http.Request) { request.RemoteAddr = "127.0.0.1:50000" }
	withSecret := func(secret string) func(*http.Request) {
		return func(request *http.Request) { request.Header.Set("Authorization", "Bearer "+secret) }
	}
	body := map[string]any{"prompt": "Password for 'https://example.com': "}

	cases := []struct {
		name   string
		mutate []func(*http.Request)
		status int
	}{
		{"another machine", []func(*http.Request){withSecret("guess")}, http.StatusForbidden},
		// The fixture sends the session token; it is not a job secret.
		{"session token", []func(*http.Request){fromLoopback}, http.StatusUnauthorized},
		{"unknown secret", []func(*http.Request){fromLoopback, withSecret("guess")}, http.StatusUnauthorized},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			response := f.post(t, server.AskpassPath, body, c.mutate...)
			if response.Code != c.status {
				t.Fatalf("status %d, want %d: %s", response.Code, c.status, response.Body)
			}
		})
	}
}
