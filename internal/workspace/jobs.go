package workspace

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"gitview/internal/git"
)

// A job is a write that runs in the background, such as fetch, pull or
// push: StartJob returns at once with the job's ID, the job waits for the
// repository's write lock like any write, reports git's progress as
// JobUpdated events while it runs, and can be canceled. Its commands go to
// the command log and the change it makes is reported by one RepoChanged
// event when it finishes, exactly as for Write.

// JobState is where a job is in its life.
type JobState string

const (
	// JobQueued means the job waits for another write to finish.
	JobQueued  JobState = "queued"
	JobRunning JobState = "running"
	// JobSucceeded, JobFailed and JobCanceled are final.
	JobSucceeded JobState = "succeeded"
	JobFailed    JobState = "failed"
	JobCanceled  JobState = "canceled"
)

// Finished reports whether the state is final.
func (s JobState) Finished() bool {
	return s == JobSucceeded || s == JobFailed || s == JobCanceled
}

// Job is a snapshot of a background write.
type Job struct {
	ID     string `json:"id"`
	RepoID string `json:"repoId"`
	// Operation names what the job does, e.g. "fetch".
	Operation string   `json:"operation"`
	State     JobState `json:"state"`
	// Progress is the last status line git printed; nil before the first.
	Progress *git.Progress `json:"progress,omitempty"`
	// Commands are the git commands the job ran, once it has finished.
	Commands []git.LogEntry `json:"commands"`
	// Err is why the job failed; nil unless State is JobFailed.
	Err error `json:"-"`
}

// JobUpdated reports that a job changed state or git printed progress.
// Progress updates are thinned out; the final state is always reported. Get
// the job for its commands and error.
type JobUpdated struct {
	RepoID    string        `json:"repoId"`
	JobID     string        `json:"jobId"`
	Operation string        `json:"operation"`
	State     JobState      `json:"state"`
	Progress  *git.Progress `json:"progress,omitempty"`
}

// EventType implements Event.
func (JobUpdated) EventType() string { return "job.updated" }

// progressInterval is the shortest time between two progress events of one
// job, unless git moves on to another phase. git updates its counters far
// more often than a person can read them.
const progressInterval = 100 * time.Millisecond

// jobHistory is how many finished jobs each repository remembers.
const jobHistory = 20

// job is a running or finished background write.
type job struct {
	cancel context.CancelFunc
	done   chan struct{}

	mu            sync.Mutex
	snapshot      Job
	lastPublished time.Time
	publish       func(Event)
}

// StartJob runs op in the background as a job named operation and returns
// its first snapshot. Unlike Write, a job is not bound to the request that
// started it: it runs until it finishes or CancelJob stops it.
func (r *Repo) StartJob(operation string, op WriteFunc) Job {
	ctx, cancel := context.WithCancel(context.Background())
	j := &job{
		cancel:   cancel,
		done:     make(chan struct{}),
		snapshot: Job{ID: newJobID(), RepoID: r.ID, Operation: operation, State: JobQueued, Commands: []git.LogEntry{}},
		publish:  r.publish,
	}
	r.jobs.add(j)
	go r.runJob(ctx, j, op)
	return j.get()
}

func (r *Repo) runJob(ctx context.Context, j *job, op WriteFunc) {
	defer close(j.done)
	defer j.cancel()
	if err := r.lock(ctx); err != nil {
		j.finish(nil, err, true)
		return
	}
	defer r.unlock()
	j.setState(JobRunning)
	commands, err := r.write(ctx, op, j.runner)
	j.finish(commands, err, ctx.Err() != nil)
}

// runner is the runner the job's commands go through: it reports what git
// prints as the job's progress. This is the place for anything else a
// remote operation needs from its commands. Credential prompts, for one:
// wrap next so commands run with GIT_ASKPASS / SSH_ASKPASS pointing at the
// gitview helper plus a per-job secret; the helper calls back into the
// server with the job's ID, the job publishes a prompt event and waits for
// the answer or for its context to be canceled.
func (j *job) runner(next git.Runner) git.Runner {
	return git.Reporting(next, j.report)
}

// Job returns the job with id, running or recently finished.
func (r *Repo) Job(id string) (Job, bool) {
	j, ok := r.jobs.find(id)
	if !ok {
		return Job{}, false
	}
	return j.get(), true
}

// Jobs lists the running jobs and the recently finished ones, oldest first.
func (r *Repo) Jobs() []Job {
	all := r.jobs.all()
	snapshots := make([]Job, 0, len(all))
	for _, j := range all {
		snapshots = append(snapshots, j.get())
	}
	return snapshots
}

// CancelJob stops the job with id: a queued job never starts, and a running
// job's git command is interrupted the way Ctrl-C would. It returns at once;
// the job reports JobCanceled when it has stopped. Canceling a finished job
// does nothing.
func (r *Repo) CancelJob(id string) (Job, bool) {
	j, ok := r.jobs.find(id)
	if !ok {
		return Job{}, false
	}
	j.cancel()
	return j.get(), true
}

// stopJobs cancels every job and waits until they have stopped.
func (r *Repo) stopJobs() {
	for _, j := range r.jobs.all() {
		j.cancel()
		<-j.done
	}
}

func (j *job) get() Job {
	j.mu.Lock()
	defer j.mu.Unlock()
	snapshot := j.snapshot
	snapshot.Commands = append([]git.LogEntry{}, j.snapshot.Commands...)
	return snapshot
}

func (j *job) setState(state JobState) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.snapshot.State = state
	j.publishLocked()
}

// report records a progress line and publishes it, unless it only moves the
// counter of the phase published moments ago: a new phase and a phase's
// completion are always published.
func (j *job) report(progress git.Progress) {
	j.mu.Lock()
	defer j.mu.Unlock()
	previous := j.snapshot.Progress
	j.snapshot.Progress = &progress
	samePhase := previous != nil && previous.Phase == progress.Phase && progress.Percent < 100
	if samePhase && time.Since(j.lastPublished) < progressInterval {
		return
	}
	j.publishLocked()
}

// finish records the outcome. A job whose context was canceled counts as
// canceled when it failed: git was interrupted.
func (j *job) finish(commands []git.LogEntry, err error, canceled bool) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.snapshot.Commands = append([]git.LogEntry{}, commands...)
	switch {
	case err == nil:
		j.snapshot.State = JobSucceeded
	case canceled || errors.Is(err, context.Canceled):
		j.snapshot.State = JobCanceled
	default:
		j.snapshot.State, j.snapshot.Err = JobFailed, err
	}
	j.publishLocked()
}

func (j *job) publishLocked() {
	j.lastPublished = time.Now()
	j.publish(JobUpdated{
		RepoID:    j.snapshot.RepoID,
		JobID:     j.snapshot.ID,
		Operation: j.snapshot.Operation,
		State:     j.snapshot.State,
		Progress:  j.snapshot.Progress,
	})
}

func newJobID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// jobList is a repository's running and recently finished jobs.
type jobList struct {
	mu   sync.Mutex
	jobs []*job
}

// add appends j and forgets the oldest finished jobs beyond jobHistory.
func (l *jobList) add(j *job) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.jobs = append(l.jobs, j)
	finished := 0
	for _, existing := range l.jobs {
		if existing.get().State.Finished() {
			finished++
		}
	}
	kept := l.jobs[:0]
	for _, existing := range l.jobs {
		if finished > jobHistory && existing.get().State.Finished() {
			finished--
			continue
		}
		kept = append(kept, existing)
	}
	l.jobs = kept
}

func (l *jobList) find(id string) (*job, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, j := range l.jobs {
		if j.snapshot.ID == id {
			return j, true
		}
	}
	return nil, false
}

func (l *jobList) all() []*job {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]*job(nil), l.jobs...)
}
