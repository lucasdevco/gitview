package git

import (
	"context"
	"errors"
	"sync"
	"time"
)

// LogEntry is one executed write command, as the command log shows it.
type LogEntry struct {
	// Command is the display form, e.g. "git add -- ':(literal)a.txt'".
	Command    string    `json:"command"`
	StartedAt  time.Time `json:"startedAt"`
	DurationMs int64     `json:"durationMs"`
	// ExitCode is git's exit status; -1 when git did not run to completion.
	ExitCode int `json:"exitCode"`
	// Error is the failure's kind; empty when the command succeeded.
	Error ErrorKind `json:"error,omitempty"`
}

// CommandLog keeps the most recent write commands of one repository. It is
// safe for concurrent use.
type CommandLog struct {
	mu      sync.Mutex
	limit   int
	entries []LogEntry
}

// NewCommandLog returns an empty log that keeps the last limit entries.
func NewCommandLog(limit int) *CommandLog {
	return &CommandLog{limit: limit}
}

// Add appends an entry, dropping the oldest once the log is full.
func (l *CommandLog) Add(entry LogEntry) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.entries = append(l.entries, entry)
	if over := len(l.entries) - l.limit; over > 0 {
		l.entries = append([]LogEntry(nil), l.entries[over:]...)
	}
}

// Entries returns the logged commands, oldest first.
func (l *CommandLog) Entries() []LogEntry {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]LogEntry{}, l.entries...)
}

// Recording wraps runner so that every write command it runs, successful or
// not, is passed to record once it finishes. Read commands are not recorded.
func Recording(runner Runner, record func(LogEntry)) Runner {
	return recordingRunner{next: runner, record: record}
}

type recordingRunner struct {
	next   Runner
	record func(LogEntry)
}

func (r recordingRunner) Run(ctx context.Context, command *Command) (Result, error) {
	started := time.Now()
	result, err := r.next.Run(ctx, command)
	if command.IsWrite() {
		entry := LogEntry{Command: command.String(), StartedAt: started, DurationMs: time.Since(started).Milliseconds()}
		var gitErr *Error
		switch {
		case errors.As(err, &gitErr):
			entry.ExitCode, entry.Error = gitErr.ExitCode, gitErr.Kind
		case err != nil:
			entry.ExitCode, entry.Error = -1, Failed
		}
		r.record(entry)
	}
	return result, err
}

// LockRetryDelays is how long RetryOnLock waits before each retry: about
// 1.6 seconds in all, enough to ride out another tool's brief index.lock.
var LockRetryDelays = []time.Duration{
	25 * time.Millisecond, 50 * time.Millisecond, 100 * time.Millisecond,
	200 * time.Millisecond, 400 * time.Millisecond, 800 * time.Millisecond,
}

// RetryOnLock wraps runner so a command that fails with LockConflict (git
// found another process's index.lock or ref lock) is run again after each of
// delays in turn. Such a command failed before changing anything, so running
// it again is safe. The last LockConflict is returned if the lock never goes
// away.
func RetryOnLock(runner Runner, delays []time.Duration) Runner {
	return retryRunner{next: runner, delays: delays}
}

type retryRunner struct {
	next   Runner
	delays []time.Duration
}

func (r retryRunner) Run(ctx context.Context, command *Command) (Result, error) {
	result, err := r.next.Run(ctx, command)
	for _, delay := range r.delays {
		if !errors.Is(err, LockConflict) {
			break
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return result, err
		case <-timer.C:
		}
		result, err = r.next.Run(ctx, command)
	}
	return result, err
}
