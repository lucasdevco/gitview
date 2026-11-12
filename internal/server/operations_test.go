package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gitview/internal/gittest"
)

type commandEntry struct {
	Command    string `json:"command"`
	StartedAt  string `json:"startedAt"`
	DurationMs int64  `json:"durationMs"`
	ExitCode   int    `json:"exitCode"`
	Error      string `json:"error"`
}

type operationResponse struct {
	Data struct {
		Commands []commandEntry `json:"commands"`
	} `json:"data"`
	Error struct {
		Code     string         `json:"code"`
		Message  string         `json:"message"`
		Output   string         `json:"output"`
		Commands []commandEntry `json:"commands"`
	} `json:"error"`
}

// post issues a same-origin JSON POST the way the frontend does.
func (f fixture) post(t *testing.T, path string, body any, mutate ...func(*http.Request)) *httptest.ResponseRecorder {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:8080"+path, strings.NewReader(string(encoded)))
	request.Header.Set("Content-Type", "application/json")
	for _, m := range mutate {
		m(request)
	}
	response := httptest.NewRecorder()
	f.handler.ServeHTTP(response, request)
	return response
}

// operate runs a write operation and returns the decoded response.
func (f fixture) operate(t *testing.T, op string, body any) (int, operationResponse) {
	t.Helper()
	response := f.post(t, "/api/v1/repos/"+f.repoID+"/operations/"+op, body)
	return response.Code, decode[operationResponse](t, response)
}

func (f fixture) mustOperate(t *testing.T, op string, body any) []commandEntry {
	t.Helper()
	code, response := f.operate(t, op, body)
	if code != http.StatusOK {
		t.Fatalf("%s: status %d: %+v", op, code, response.Error)
	}
	return response.Data.Commands
}

func commandStrings(entries []commandEntry) []string {
	out := []string{}
	for _, entry := range entries {
		out = append(out, entry.Command)
	}
	return out
}

func paths(changes []fileChange) []string {
	out := []string{}
	for _, change := range changes {
		out = append(out, change.Path)
	}
	return out
}

func TestStageMovesFilesToTheIndexAndReportsTheCommand(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("tracked.txt", "one\n", "base")
	r.Write("tracked.txt", "two\n")
	r.Write("new file.txt", "new\n")
	r.Write("other.txt", "untouched\n")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "stage", map[string]any{"paths": []string{"tracked.txt", "new file.txt"}})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git add -- ':(literal)tracked.txt' ':(literal)new file.txt'" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if commands[0].ExitCode != 0 || commands[0].StartedAt == "" {
		t.Fatalf("unexpected log entry: %+v", commands[0])
	}
	status := f.status(t)
	if got := paths(status.Staged); strings.Join(got, ",") != "new file.txt,tracked.txt" {
		t.Fatalf("staged = %q", got)
	}
	if got := paths(status.Untracked); strings.Join(got, ",") != "other.txt" {
		t.Fatalf("untracked = %q", got)
	}
}

func TestUnstageRestoresTheIndexIncludingBothSidesOfARename(t *testing.T) {
	r := gittest.Init(t)
	r.Write("old.txt", "a file that will be renamed\nwith enough content\nto be detected\n")
	r.Commit("kept.txt", "one\n", "base")
	r.Write("kept.txt", "two\n")
	r.Git("add", "kept.txt")
	r.Git("mv", "old.txt", "new.txt")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "unstage", map[string]any{"paths": []string{"new.txt", "old.txt", "kept.txt"}})

	if got := commandStrings(commands); len(got) != 1 ||
		got[0] != "git reset --quiet -- ':(literal)new.txt' ':(literal)old.txt' ':(literal)kept.txt'" {
		t.Fatalf("unexpected commands: %q", got)
	}
	status := f.status(t)
	if len(status.Staged) != 0 {
		t.Fatalf("still staged: %+v", status.Staged)
	}
	if got := strings.Join(paths(status.Unstaged), ","); got != "kept.txt,old.txt" {
		t.Fatalf("unstaged = %q", got)
	}
	if got := strings.Join(paths(status.Untracked), ","); got != "new.txt" {
		t.Fatalf("untracked = %q", got)
	}
}

func TestUnstageWorksBeforeTheFirstCommit(t *testing.T) {
	r := gittest.Init(t)
	r.Write("a.txt", "a\n")
	r.Git("add", "a.txt")
	f := newFixture(t, r)

	f.mustOperate(t, "unstage", map[string]any{"paths": []string{"a.txt"}})

	if status := f.status(t); len(status.Staged) != 0 || len(status.Untracked) != 1 {
		t.Fatalf("unexpected status: %+v", status)
	}
}

func TestCommitRecordsStagedChangesWithAMultiLineMessage(t *testing.T) {
	r := gittest.Init(t)
	base := r.Commit("a.txt", "one\n", "base")
	r.Write("a.txt", "two\n")
	r.Write("b.txt", "not staged\n")
	r.Git("add", "a.txt")
	f := newFixture(t, r)

	message := "Fix the widget\n\nIt's been broken since Tuesday."
	commands := f.mustOperate(t, "commit", map[string]any{"message": message})

	if got := commandStrings(commands); len(got) != 1 || got[0] != `git commit -m 'Fix the widget

It'\''s been broken since Tuesday.'` {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("log", "-1", "--format=%B"); got != message {
		t.Fatalf("message = %q", got)
	}
	if got := r.Git("rev-parse", "HEAD~1"); got != base {
		t.Fatalf("parent = %s, want %s", got, base)
	}
	if got := r.Git("show", "--format=", "--name-only", "HEAD"); got != "a.txt" {
		t.Fatalf("committed files = %q", got)
	}
}

func TestFirstCommitInAnEmptyRepository(t *testing.T) {
	r := gittest.Init(t)
	r.Write("README.md", "hello\n")
	f := newFixture(t, r)

	f.mustOperate(t, "stage", map[string]any{"paths": []string{"README.md"}})
	f.mustOperate(t, "commit", map[string]any{"message": "Initial commit"})

	if got := r.Git("log", "--format=%s"); got != "Initial commit" {
		t.Fatalf("log = %q", got)
	}
	if status := f.status(t); len(status.Staged)+len(status.Untracked) != 0 {
		t.Fatalf("unexpected status: %+v", status)
	}
}

func TestAmendReplacesTheLastCommit(t *testing.T) {
	r := gittest.Init(t)
	base := r.Commit("a.txt", "one\n", "base")
	r.Commit("a.txt", "two\n", "tpyo")
	r.Write("b.txt", "forgotten\n")
	r.Git("add", "b.txt")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "commit", map[string]any{"message": "typo fixed", "amend": true})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git commit --amend -m 'typo fixed'" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("log", "--format=%s"); got != "typo fixed\nbase" {
		t.Fatalf("log = %q", got)
	}
	if got := r.Git("rev-parse", "HEAD~1"); got != base {
		t.Fatalf("parent = %s, want %s", got, base)
	}
	if got := r.Git("show", "--format=", "--name-only", "HEAD"); got != "a.txt\nb.txt" {
		t.Fatalf("amended files = %q", got)
	}
}

func TestCommitNeedsAMessage(t *testing.T) {
	r := gittest.Init(t)
	r.Write("a.txt", "a\n")
	r.Git("add", "a.txt")
	f := newFixture(t, r)

	code, response := f.operate(t, "commit", map[string]any{"message": " \n\t"})

	if code != http.StatusBadRequest || response.Error.Code != "invalid_request" {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if got := r.GitFails("rev-parse", "--verify", "--quiet", "HEAD"); got != "" {
		t.Fatalf("unexpected output %q", got)
	}
}

func TestCommitWithNothingStagedExplainsWhy(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	r.Write("a.txt", "changed but not staged\n")
	f := newFixture(t, r)

	code, response := f.operate(t, "commit", map[string]any{"message": "nothing"})

	if code == http.StatusOK || !strings.Contains(response.Error.Output, "no changes added to commit") {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if len(response.Error.Commands) != 1 || response.Error.Commands[0].ExitCode != 1 {
		t.Fatalf("failed command should be reported: %+v", response.Error.Commands)
	}
}

func TestFailingPreCommitHookIsReportedWithItsOutput(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	// The output deliberately resembles other git failures; the hook decides.
	r.Hook("pre-commit", "echo 'lint: a.txt:1 trailing whitespace'\necho 'CONFLICT (content): pretend' >&2\nexit 1\n")
	r.Write("a.txt", "b \n")
	r.Git("add", "a.txt")
	f := newFixture(t, r)

	code, response := f.operate(t, "commit", map[string]any{"message": "change"})

	if code != http.StatusUnprocessableEntity || response.Error.Code != "hook_failed" ||
		!strings.Contains(response.Error.Message, "pre-commit") ||
		!strings.Contains(response.Error.Output, "lint: a.txt:1 trailing whitespace") ||
		!strings.Contains(response.Error.Output, "CONFLICT (content): pretend") {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if got := commandStrings(response.Error.Commands); len(got) != 1 || got[0] != "git commit -m change" ||
		response.Error.Commands[0].Error != "hook_failed" {
		t.Fatalf("failed command should be reported: %+v", response.Error.Commands)
	}
	if got := r.Git("log", "--format=%s"); got != "base" {
		t.Fatalf("hook should have stopped the commit; log = %q", got)
	}
}

func TestFailingCommitMsgHookIsReported(t *testing.T) {
	r := gittest.Init(t)
	r.Hook("commit-msg", "echo 'subject must start with a ticket number' >&2\nexit 1\n")
	r.Write("a.txt", "a\n")
	r.Git("add", "a.txt")
	f := newFixture(t, r)

	code, response := f.operate(t, "commit", map[string]any{"message": "no ticket"})

	if code != http.StatusUnprocessableEntity || response.Error.Code != "hook_failed" ||
		!strings.Contains(response.Error.Message, "commit-msg") ||
		!strings.Contains(response.Error.Output, "subject must start with a ticket number") {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
}

func TestSkippingHooksCommitsDespiteAFailingHook(t *testing.T) {
	r := gittest.Init(t)
	r.Hook("pre-commit", "exit 1\n")
	r.Write("a.txt", "a\n")
	r.Git("add", "a.txt")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "commit", map[string]any{"message": "wip", "noVerify": true})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git commit --no-verify -m wip" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("log", "--format=%s"); got != "wip" {
		t.Fatalf("log = %q", got)
	}
}

func TestOperationsOnlyAcceptJSONPosts(t *testing.T) {
	r := gittest.Init(t)
	r.Write("a.txt", "a\n")
	f := newFixture(t, r)
	path := "/api/v1/repos/" + f.repoID + "/operations/stage"
	body := map[string]any{"paths": []string{"a.txt"}}

	if response := f.get(t, path); response.Code != http.StatusMethodNotAllowed || response.Header().Get("Allow") != "POST" {
		t.Fatalf("GET: status %d", response.Code)
	}
	for _, contentType := range []string{"", "text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"} {
		response := f.post(t, path, body, func(r *http.Request) { r.Header.Set("Content-Type", contentType) })
		if response.Code != http.StatusUnsupportedMediaType {
			t.Fatalf("%q: status %d", contentType, response.Code)
		}
	}
	if response := f.post(t, path, body, func(r *http.Request) { r.Header.Set("Origin", "http://evil.example") }); response.Code != http.StatusForbidden {
		t.Fatalf("cross-origin: status %d", response.Code)
	}
	if response := f.post(t, path, body, func(r *http.Request) { r.Host = "evil.example:8080" }); response.Code != http.StatusForbidden {
		t.Fatalf("DNS-rebound host: status %d", response.Code)
	}
	if staged := f.status(t).Staged; len(staged) != 0 {
		t.Fatalf("rejected requests must not change the repository: %+v", staged)
	}

	response := f.post(t, path, body, func(r *http.Request) { r.Header.Set("Content-Type", "application/json; charset=utf-8") })
	if response.Code != http.StatusOK {
		t.Fatalf("JSON with charset: status %d: %s", response.Code, response.Body)
	}
}

func TestOperationRequestsAreValidated(t *testing.T) {
	r := gittest.Init(t)
	f := newFixture(t, r)

	code, response := f.operate(t, "explode", map[string]any{})
	if code != http.StatusNotFound || response.Error.Code != "unknown_operation" || !strings.Contains(response.Error.Message, "commit") {
		t.Fatalf("unknown op: status %d: %+v", code, response.Error)
	}
	code, response = f.operate(t, "commit", map[string]any{"message": "m", "amned": true})
	if code != http.StatusBadRequest || response.Error.Code != "invalid_request" || !strings.Contains(response.Error.Message, "amned") {
		t.Fatalf("unknown field: status %d: %+v", code, response.Error)
	}
	code, response = f.operate(t, "commit", "not an object")
	if code != http.StatusBadRequest || response.Error.Code != "invalid_request" {
		t.Fatalf("wrong type: status %d: %+v", code, response.Error)
	}
	if response := f.post(t, "/api/v1/repos/missing/operations/stage", map[string]any{}); response.Code != http.StatusNotFound {
		t.Fatalf("unknown repo: status %d", response.Code)
	}
}

func TestCommandLogListsRecentWriteCommandsOldestFirst(t *testing.T) {
	r := gittest.Init(t)
	r.Write("a.txt", "a\n")
	f := newFixture(t, r)

	empty := f.get(t, "/api/v1/repos/"+f.repoID+"/commands")
	if got := decode[struct{ Data []commandEntry }](t, empty).Data; empty.Code != http.StatusOK || got == nil || len(got) != 0 {
		t.Fatalf("status %d: %s", empty.Code, empty.Body)
	}

	f.mustOperate(t, "stage", map[string]any{"paths": []string{"a.txt"}})
	f.operate(t, "commit", map[string]any{"message": "first", "amend": true}) // fails: nothing to amend
	f.mustOperate(t, "commit", map[string]any{"message": "first"})
	f.status(t) // reads are not logged

	response := f.get(t, "/api/v1/repos/"+f.repoID+"/commands")
	got := decode[struct{ Data []commandEntry }](t, response).Data
	want := []string{"git add -- ':(literal)a.txt'", "git commit --amend -m first", "git commit -m first"}
	if strings.Join(commandStrings(got), "\n") != strings.Join(want, "\n") {
		t.Fatalf("log = %q", commandStrings(got))
	}
	if got[1].ExitCode == 0 || got[1].Error == "" || got[2].ExitCode != 0 || got[2].Error != "" {
		t.Fatalf("outcomes not recorded: %+v", got)
	}
}

func TestBriefIndexLockIsRetried(t *testing.T) {
	r := gittest.Init(t)
	r.Write("a.txt", "a\n")
	lock := filepath.Join(r.Dir, ".git", "index.lock")
	if err := os.WriteFile(lock, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	f := newFixture(t, r)
	go func() {
		time.Sleep(150 * time.Millisecond)
		_ = os.Remove(lock)
	}()

	commands := f.mustOperate(t, "stage", map[string]any{"paths": []string{"a.txt"}})

	if len(commands) != 1 || commands[0].ExitCode != 0 {
		t.Fatalf("retries should appear as one successful command: %+v", commands)
	}
	if got := paths(f.status(t).Staged); strings.Join(got, ",") != "a.txt" {
		t.Fatalf("staged = %q", got)
	}
}

func TestIndexLockThatStaysIsReportedAsALockConflict(t *testing.T) {
	r := gittest.Init(t)
	r.Write("a.txt", "a\n")
	if err := os.WriteFile(filepath.Join(r.Dir, ".git", "index.lock"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	f := newFixture(t, r)

	code, response := f.operate(t, "stage", map[string]any{"paths": []string{"a.txt"}})

	if code != http.StatusConflict || response.Error.Code != "lock_conflict" || !strings.Contains(response.Error.Output, "index.lock") {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
}

func TestWritesAreSerializedWhileReadsContinue(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	// The hook holds the first commit open until the test releases it.
	r.Hook("pre-commit", "touch .git/hook-started\ni=0\nwhile [ ! -e .git/hook-release ] && [ $i -lt 200 ]; do sleep 0.05; i=$((i+1)); done\n")
	r.Write("a.txt", "changed\n")
	r.Git("add", "a.txt")
	r.Write("b.txt", "b\n")
	f := newFixture(t, r)

	type outcome struct {
		code     int
		response operationResponse
	}
	first, second := make(chan outcome, 1), make(chan outcome, 1)
	go func() {
		code, response := f.operate(t, "commit", map[string]any{"message": "slow"})
		first <- outcome{code, response}
	}()
	waitFor(t, filepath.Join(r.Dir, ".git", "hook-started"))

	// Reads answer while the write is in progress.
	read := make(chan int, 1)
	go func() { read <- f.get(t, "/api/v1/repos/"+f.repoID+"/status").Code }()
	select {
	case code := <-read:
		if code != http.StatusOK {
			t.Fatalf("read during write: status %d", code)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("read was blocked by the write")
	}

	// A second write waits for the first instead of failing on index.lock,
	// even when the first takes longer than the lock retries would cover.
	go func() {
		code, response := f.operate(t, "stage", map[string]any{"paths": []string{"b.txt"}})
		second <- outcome{code, response}
	}()
	time.Sleep(2 * time.Second)
	select {
	case got := <-second:
		t.Fatalf("second write ran during the first: status %d: %+v", got.code, got.response.Error)
	default:
	}
	if err := os.WriteFile(filepath.Join(r.Dir, ".git", "hook-release"), nil, 0o644); err != nil {
		t.Fatal(err)
	}

	a, b := <-first, <-second
	if a.code != http.StatusOK || b.code != http.StatusOK {
		t.Fatalf("first: %d %+v; second: %d %+v", a.code, a.response.Error, b.code, b.response.Error)
	}
	commitEntry, stageEntry := a.response.Data.Commands[0], b.response.Data.Commands[0]
	commitStart, _ := time.Parse(time.RFC3339Nano, commitEntry.StartedAt)
	stageStart, _ := time.Parse(time.RFC3339Nano, stageEntry.StartedAt)
	if commitEnd := commitStart.Add(time.Duration(commitEntry.DurationMs) * time.Millisecond); stageStart.Before(commitEnd) {
		t.Fatalf("stage started at %v, before the commit ended at %v", stageStart, commitEnd)
	}
}

func waitFor(t *testing.T, path string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", path)
}

func TestStagingRejectsMissingPathsAndPathsOutsideTheRepository(t *testing.T) {
	r := gittest.Init(t)
	f := newFixture(t, r)

	for _, body := range []map[string]any{{"paths": []string{}}, {"paths": []string{"../escape.txt"}}, {}} {
		code, response := f.operate(t, "stage", body)
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" || len(response.Error.Commands) != 0 {
			t.Fatalf("%v: status %d: %+v", body, code, response.Error)
		}
	}
}
