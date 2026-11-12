package server_test

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"gitview/internal/gittest"
)

// eventDeadline is how long an outside change may take to reach a
// subscriber. Change detection is debounced well below this.
const eventDeadline = 5 * time.Second

type repoChanged struct {
	Type    string   `json:"type"`
	RepoID  string   `json:"repoId"`
	Version uint64   `json:"version"`
	Changed []string `json:"changed"`
}

// eventStream is an open GET /api/v1/events response, read as the browser's
// EventSource would.
type eventStream struct {
	header http.Header
	status int
	events chan repoChanged
	// jobs receives job.updated events, which events does not.
	jobs chan jobUpdated
}

// streamWriter is a ResponseWriter whose body is readable while the handler
// is still writing, so a test can follow a server-sent event stream without
// opening a network socket.
type streamWriter struct {
	header http.Header
	status chan int
	once   sync.Once
	body   *io.PipeWriter
}

func (w *streamWriter) Header() http.Header { return w.header }
func (w *streamWriter) WriteHeader(status int) {
	w.once.Do(func() { w.status <- status })
}
func (w *streamWriter) Write(p []byte) (int, error) {
	w.WriteHeader(http.StatusOK)
	return w.body.Write(p)
}
func (w *streamWriter) Flush() {}

// subscribe opens the event stream and returns once the server has
// registered the subscription.
func (f fixture) subscribe(t *testing.T) *eventStream {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/api/v1/events", nil).WithContext(ctx)
	// What the browser's EventSource sends from the gitview page.
	request.Header.Set("Origin", "http://127.0.0.1:8080")
	request.Header.Set("Sec-Fetch-Site", "same-origin")
	reader, writer := io.Pipe()
	w := &streamWriter{header: http.Header{}, status: make(chan int, 1), body: writer}
	done := make(chan struct{})
	go func() {
		defer close(done)
		f.handler.ServeHTTP(w, request)
		_ = writer.Close()
	}()
	t.Cleanup(func() {
		cancel()
		_ = reader.Close()
		<-done
	})

	stream := &eventStream{header: w.header, events: make(chan repoChanged, 16), jobs: make(chan jobUpdated, 256)}
	select {
	case stream.status = <-w.status:
	case <-time.After(eventDeadline):
		t.Fatal("event stream did not start")
	}
	if stream.status != http.StatusOK {
		body, _ := io.ReadAll(reader)
		t.Fatalf("event stream: status %d: %s", stream.status, body)
	}

	lines := bufio.NewScanner(reader)
	// The server opens the stream with a comment once it is subscribed.
	if !lines.Scan() || !strings.HasPrefix(lines.Text(), ":") {
		t.Fatalf("expected an opening comment, got %q", lines.Text())
	}
	go func() {
		defer close(stream.events)
		defer close(stream.jobs)
		for lines.Scan() {
			data, ok := strings.CutPrefix(lines.Text(), "data: ")
			if !ok {
				continue
			}
			if strings.HasPrefix(data, `{"type":"job.updated"`) {
				var update jobUpdated
				if err := json.Unmarshal([]byte(data), &update); err != nil {
					t.Errorf("decode event %q: %v", data, err)
					return
				}
				stream.jobs <- update
				continue
			}
			var event repoChanged
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				t.Errorf("decode event %q: %v", data, err)
				return
			}
			stream.events <- event
		}
	}()
	return stream
}

// next waits for the next event.
func (s *eventStream) next(t *testing.T) repoChanged {
	t.Helper()
	select {
	case event, ok := <-s.events:
		if !ok {
			t.Fatal("event stream ended")
		}
		return event
	case <-time.After(eventDeadline):
		t.Fatalf("no event within %s", eventDeadline)
		return repoChanged{}
	}
}

// nextChanging waits for an event that reports area. An outside git command
// may be noticed part-way, so earlier events are skipped.
func (s *eventStream) nextChanging(t *testing.T, area string) repoChanged {
	t.Helper()
	deadline := time.After(eventDeadline)
	for {
		select {
		case event, ok := <-s.events:
			if !ok {
				t.Fatal("event stream ended")
			}
			if slices.Contains(event.Changed, area) {
				return event
			}
		case <-deadline:
			t.Fatalf("no %s change within %s", area, eventDeadline)
		}
	}
}

// quiet asserts that no event arrives for a while.
func (s *eventStream) quiet(t *testing.T, wait time.Duration) {
	t.Helper()
	select {
	case event := <-s.events:
		t.Fatalf("unexpected event %+v", event)
	case <-time.After(wait):
	}
}

func TestEventStreamIsServerSentEvents(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "first")
	stream := newFixture(t, r).subscribe(t)

	if got := stream.header.Get("Content-Type"); got != "text/event-stream" {
		t.Fatalf("Content-Type = %q", got)
	}
	if got := stream.header.Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q", got)
	}
}

func TestEventStreamRefusesOtherOrigins(t *testing.T) {
	r := gittest.Init(t)
	response := newFixture(t, r).get(t, "/api/v1/events", func(request *http.Request) {
		request.Header.Set("Origin", "https://evil.example")
	})
	if response.Code != http.StatusForbidden {
		t.Fatalf("status %d", response.Code)
	}
}

func TestOutsideBranchSwitchIsReportedAsRefsChange(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "first")
	f := newFixture(t, r)
	stream := f.subscribe(t)

	r.Git("checkout", "--quiet", "-b", "feature")

	event := stream.next(t)
	if event.Type != "repo.changed" || event.RepoID != f.repoID || event.Version == 0 {
		t.Fatalf("unexpected event %+v", event)
	}
	if !slices.Contains(event.Changed, "refs") {
		t.Fatalf("changed = %v, want refs", event.Changed)
	}
}

func TestOutsideStagingIsReportedAsIndexChange(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "first")
	f := newFixture(t, r)
	stream := f.subscribe(t)

	r.Write("a.txt", "changed\n")
	r.Git("add", "a.txt")

	event := stream.next(t)
	if !slices.Equal(event.Changed, []string{"index"}) {
		t.Fatalf("changed = %v, want [index]", event.Changed)
	}
}

func TestOutsideMergeConflictIsReportedAsStateChange(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "base\n", "base")
	r.Git("checkout", "--quiet", "-b", "other")
	r.Commit("a.txt", "other\n", "other")
	r.Git("checkout", "--quiet", "main")
	r.Commit("a.txt", "main\n", "main")
	f := newFixture(t, r)
	stream := f.subscribe(t)

	r.GitFails("merge", "other")

	stream.nextChanging(t, "state")
}

func TestOwnWriteIsReportedOnceWhenItFinishes(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "first")
	r.Write("a.txt", "changed\n")
	f := newFixture(t, r)
	stream := f.subscribe(t)

	f.mustOperate(t, "stage", map[string]any{"paths": []string{"a.txt"}})
	f.mustOperate(t, "commit", map[string]any{"message": "second"})

	staged := stream.next(t)
	if !slices.Contains(staged.Changed, "index") || !slices.Contains(staged.Changed, "worktree") {
		t.Fatalf("stage: changed = %v, want index and worktree", staged.Changed)
	}
	committed := stream.next(t)
	if !slices.Contains(committed.Changed, "refs") {
		t.Fatalf("commit: changed = %v, want refs", committed.Changed)
	}
	if committed.Version <= staged.Version {
		t.Fatalf("versions should increase: %d then %d", staged.Version, committed.Version)
	}
	// The file system notices the writes too, but they are already reported.
	stream.quiet(t, time.Second)
}
