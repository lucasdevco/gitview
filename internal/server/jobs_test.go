package server_test

import (
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"gitview/internal/gittest"
)

// jobDeadline is how long a job against a local origin may take.
const jobDeadline = 10 * time.Second

type jobProgress struct {
	Phase   string `json:"phase"`
	Percent int    `json:"percent"`
	Text    string `json:"text"`
}

type jobError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Output  string `json:"output"`
}

type job struct {
	ID        string         `json:"id"`
	RepoID    string         `json:"repoId"`
	Operation string         `json:"operation"`
	State     string         `json:"state"`
	Progress  *jobProgress   `json:"progress"`
	Commands  []commandEntry `json:"commands"`
	Error     *jobError      `json:"error"`
}

type jobResponse struct {
	Data  job      `json:"data"`
	Error jobError `json:"error"`
}

func finished(state string) bool {
	return state == "succeeded" || state == "failed" || state == "canceled"
}

// startJob starts a background operation and returns the job as the
// response describes it.
func (f fixture) startJob(t *testing.T, op string, body any) job {
	t.Helper()
	response := f.post(t, "/api/v1/repos/"+f.repoID+"/operations/"+op, body)
	decoded := decode[jobResponse](t, response)
	if response.Code != http.StatusAccepted {
		t.Fatalf("%s: status %d: %+v", op, response.Code, decoded.Error)
	}
	if decoded.Data.ID == "" || decoded.Data.Operation != op || decoded.Data.RepoID != f.repoID {
		t.Fatalf("%s: unexpected job %+v", op, decoded.Data)
	}
	return decoded.Data
}

func (f fixture) job(t *testing.T, id string) job {
	t.Helper()
	response := f.get(t, "/api/v1/repos/"+f.repoID+"/jobs/"+id)
	decoded := decode[jobResponse](t, response)
	if response.Code != http.StatusOK {
		t.Fatalf("job %s: status %d: %+v", id, response.Code, decoded.Error)
	}
	return decoded.Data
}

// waitJob polls the job until it has finished.
func (f fixture) waitJob(t *testing.T, id string) job {
	t.Helper()
	deadline := time.Now().Add(jobDeadline)
	for {
		current := f.job(t, id)
		if finished(current.State) {
			return current
		}
		if time.Now().After(deadline) {
			t.Fatalf("job %s still %s after %s", id, current.State, jobDeadline)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// remoteSetup is a repository cloned from a bare origin, plus a second clone
// that publishes to the origin the way a colleague would.
type remoteSetup struct {
	origin, local, colleague *gittest.Repo
}

func newRemoteSetup(t *testing.T) remoteSetup {
	t.Helper()
	origin := gittest.InitBare(t)
	colleague := gittest.Clone(t, origin.Dir)
	colleague.Commit("a.txt", "one\n", "first")
	colleague.Git("push", "--quiet", "origin", "main")
	local := gittest.Clone(t, origin.Dir)
	return remoteSetup{origin: origin, local: local, colleague: colleague}
}

func (f fixture) refs(t *testing.T) refsBody {
	t.Helper()
	response := f.get(t, "/api/v1/repos/"+f.repoID+"/refs")
	if response.Code != http.StatusOK {
		t.Fatalf("refs: status %d: %s", response.Code, response.Body)
	}
	return decode[struct {
		Data refsBody `json:"data"`
	}](t, response).Data
}

func remoteBranchNames(refs refsBody) []string {
	names := []string{}
	for _, remote := range refs.Remotes {
		for _, branch := range remote.Branches {
			names = append(names, branch.Name)
		}
	}
	return names
}

func TestFetchJobBringsInNewCommitsAndUpdatesBehindCount(t *testing.T) {
	s := newRemoteSetup(t)
	newest := s.colleague.Commit("a.txt", "two\n", "second")
	s.colleague.Git("push", "--quiet", "origin", "main")
	f := newFixture(t, s.local)

	started := f.startJob(t, "fetch", map[string]any{"all": true})
	done := f.waitJob(t, started.ID)

	if done.State != "succeeded" || done.Error != nil {
		t.Fatalf("fetch: %+v", done)
	}
	if got := commandStrings(done.Commands); !slices.Equal(got, []string{"git fetch --progress --all"}) {
		t.Fatalf("commands = %q", got)
	}
	if got := s.local.Git("rev-parse", "origin/main"); got != newest {
		t.Fatalf("origin/main = %s, want %s", got, newest)
	}
	refs := f.refs(t)
	if len(refs.Branches) != 1 || refs.Branches[0].Behind != 1 {
		t.Fatalf("branches = %+v, want main 1 behind", refs.Branches)
	}
	// The job's commands are in the command log like any write.
	log := decode[struct {
		Data []commandEntry `json:"data"`
	}](t, f.get(t, "/api/v1/repos/"+f.repoID+"/commands"))
	if got := commandStrings(log.Data); !slices.Contains(got, "git fetch --progress --all") {
		t.Fatalf("command log = %q", got)
	}
}

func TestFetchJobPrunesRemovedBranchesAndFetchesTags(t *testing.T) {
	s := newRemoteSetup(t)
	s.colleague.Git("push", "--quiet", "origin", "main:gone")
	f := newFixture(t, s.local)
	f.waitJob(t, f.startJob(t, "fetch", map[string]any{}).ID)
	if got := remoteBranchNames(f.refs(t)); !slices.Contains(got, "origin/gone") {
		t.Fatalf("setup: remote branches = %q", got)
	}
	s.colleague.Git("push", "--quiet", "origin", "--delete", "gone")
	// A tag on a commit no branch reaches is only fetched with --tags.
	s.colleague.Git("checkout", "--quiet", "--detach")
	s.colleague.Commit("b.txt", "side\n", "side")
	s.colleague.Git("tag", "v1")
	s.colleague.Git("push", "--quiet", "origin", "v1")

	done := f.waitJob(t, f.startJob(t, "fetch", map[string]any{"remote": "origin", "prune": true, "tags": true}).ID)

	if done.State != "succeeded" {
		t.Fatalf("fetch: %+v", done)
	}
	if got := commandStrings(done.Commands); !slices.Equal(got, []string{"git fetch --progress origin --prune --tags"}) {
		t.Fatalf("commands = %q", got)
	}
	refs := f.refs(t)
	if got := remoteBranchNames(refs); slices.Contains(got, "origin/gone") {
		t.Fatalf("pruned branch still listed: %q", got)
	}
	if len(refs.Tags) != 1 || refs.Tags[0].Name != "v1" {
		t.Fatalf("tags = %+v, want v1", refs.Tags)
	}
}

func TestFetchJobFailureCarriesGitOutput(t *testing.T) {
	s := newRemoteSetup(t)
	f := newFixture(t, s.local)

	done := f.waitJob(t, f.startJob(t, "fetch", map[string]any{"remote": "nowhere"}).ID)

	if done.State != "failed" || done.Error == nil {
		t.Fatalf("fetch: %+v", done)
	}
	if done.Error.Code != "git_failed" || !strings.Contains(done.Error.Output, "nowhere") {
		t.Fatalf("error = %+v", done.Error)
	}
	if len(done.Commands) != 1 || done.Commands[0].ExitCode == 0 {
		t.Fatalf("commands = %+v", done.Commands)
	}
}

func TestFetchRejectsAllTogetherWithARemote(t *testing.T) {
	s := newRemoteSetup(t)
	f := newFixture(t, s.local)

	response := f.post(t, "/api/v1/repos/"+f.repoID+"/operations/fetch", map[string]any{"all": true, "remote": "origin"})

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	if code := decode[jobResponse](t, response).Error.Code; code != "invalid_request" {
		t.Fatalf("code = %q", code)
	}
}

func TestUnknownJobIsNotFound(t *testing.T) {
	s := newRemoteSetup(t)
	f := newFixture(t, s.local)

	response := f.get(t, "/api/v1/repos/"+f.repoID+"/jobs/missing")

	if response.Code != http.StatusNotFound || decode[jobResponse](t, response).Error.Code != "job_not_found" {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
}

type jobUpdated struct {
	Type      string       `json:"type"`
	RepoID    string       `json:"repoId"`
	JobID     string       `json:"jobId"`
	Operation string       `json:"operation"`
	State     string       `json:"state"`
	Progress  *jobProgress `json:"progress"`
}

// untilFinished collects the job's updates up to its final state.
func (s *eventStream) untilFinished(t *testing.T, id string) []jobUpdated {
	t.Helper()
	deadline := time.After(jobDeadline)
	updates := []jobUpdated{}
	for {
		select {
		case update, ok := <-s.jobs:
			if !ok {
				t.Fatal("event stream ended")
			}
			if update.JobID != id {
				continue
			}
			updates = append(updates, update)
			if finished(update.State) {
				return updates
			}
		case <-deadline:
			t.Fatalf("job %s did not finish within %s; updates: %+v", id, jobDeadline, updates)
		}
	}
}

func TestFetchJobReportsProgressOverTheEventStream(t *testing.T) {
	s := newRemoteSetup(t)
	for i := range 20 {
		s.colleague.Commit("a.txt", strings.Repeat("line\n", i+2), "more")
	}
	s.colleague.Git("push", "--quiet", "origin", "main")
	f := newFixture(t, s.local)
	stream := f.subscribe(t)

	started := f.startJob(t, "fetch", map[string]any{"all": true})
	updates := stream.untilFinished(t, started.ID)

	states := []string{}
	counted := []jobProgress{}
	for _, update := range updates {
		if update.Type != "job.updated" || update.RepoID != f.repoID || update.Operation != "fetch" {
			t.Fatalf("unexpected update %+v", update)
		}
		states = append(states, update.State)
		if update.Progress != nil && update.Progress.Phase == "remote: Counting objects" {
			counted = append(counted, *update.Progress)
		}
	}
	if !slices.Contains(states, "running") || states[len(states)-1] != "succeeded" {
		t.Fatalf("states = %q", states)
	}
	// However many updates are thinned out, a phase's completion arrives.
	if len(counted) == 0 || counted[len(counted)-1].Percent != 100 ||
		!strings.HasPrefix(counted[len(counted)-1].Text, "remote: Counting objects: 100% (62/62)") {
		t.Fatalf("counting progress = %+v, want it to end at 100%%", counted)
	}
	// The fetched branches are reported once the job finishes.
	stream.nextChanging(t, "refs")
}

// slowOrigin makes fetching from origin hang until the test cancels it.
func slowOrigin(t *testing.T, s remoteSetup) {
	t.Helper()
	script := filepath.Join(t.TempDir(), "slow-upload-pack")
	if err := os.WriteFile(script, []byte("#!/bin/sh\nexec sleep 30\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	s.local.Git("config", "remote.origin.uploadpack", script)
}

func (f fixture) cancelJob(t *testing.T, id string) job {
	t.Helper()
	response := f.post(t, "/api/v1/repos/"+f.repoID+"/jobs/"+id+"/cancel", map[string]any{})
	decoded := decode[jobResponse](t, response)
	if response.Code != http.StatusOK {
		t.Fatalf("cancel %s: status %d: %+v", id, response.Code, decoded.Error)
	}
	return decoded.Data
}

func TestCancelingAFetchJobStopsGitAndChangesNothing(t *testing.T) {
	s := newRemoteSetup(t)
	before := s.local.Git("rev-parse", "origin/main")
	s.colleague.Commit("a.txt", "two\n", "second")
	s.colleague.Git("push", "--quiet", "origin", "main")
	slowOrigin(t, s)
	f := newFixture(t, s.local)

	started := f.startJob(t, "fetch", map[string]any{"remote": "origin"})
	for f.job(t, started.ID).State != "running" {
		time.Sleep(10 * time.Millisecond)
	}
	canceledAt := time.Now()
	f.cancelJob(t, started.ID)
	done := f.waitJob(t, started.ID)

	if done.State != "canceled" || done.Error != nil {
		t.Fatalf("job = %+v", done)
	}
	if took := time.Since(canceledAt); took > 3*time.Second {
		t.Fatalf("cancel took %s", took)
	}
	if got := s.local.Git("rev-parse", "origin/main"); got != before {
		t.Fatalf("origin/main moved to %s", got)
	}
	// The write lock is free again.
	s.local.Write("b.txt", "b\n")
	f.mustOperate(t, "stage", map[string]any{"paths": []string{"b.txt"}})
}

func TestJobsQueueBehindTheRunningWriteAndCanBeCanceledWhileQueued(t *testing.T) {
	s := newRemoteSetup(t)
	slowOrigin(t, s)
	f := newFixture(t, s.local)

	running := f.startJob(t, "fetch", map[string]any{})
	queued := f.startJob(t, "fetch", map[string]any{"prune": true})
	for f.job(t, running.ID).State != "running" {
		time.Sleep(10 * time.Millisecond)
	}
	if state := f.job(t, queued.ID).State; state != "queued" {
		t.Fatalf("second job is %s, want queued", state)
	}
	listed := decode[struct {
		Data []job `json:"data"`
	}](t, f.get(t, "/api/v1/repos/"+f.repoID+"/jobs")).Data
	if len(listed) != 2 || listed[0].ID != running.ID || listed[1].ID != queued.ID {
		t.Fatalf("jobs = %+v", listed)
	}

	f.cancelJob(t, queued.ID)
	if done := f.waitJob(t, queued.ID); done.State != "canceled" || len(done.Commands) != 0 {
		t.Fatalf("queued job = %+v", done)
	}
	if state := f.job(t, running.ID).State; state != "running" {
		t.Fatalf("first job is %s, want still running", state)
	}
	f.cancelJob(t, running.ID)
	f.waitJob(t, running.ID)
}
