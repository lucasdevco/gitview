package git

import (
	"bytes"
	"context"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

// Progress is one status line git printed while working, as commands run
// with --progress (fetch, pull, push, clone) print it on stderr, e.g.
//
//	Receiving objects:  45% (9/20), 1.2 MiB | 2.0 MiB/s
type Progress struct {
	// Phase is the counter's name, e.g. "Receiving objects" or
	// "remote: Counting objects"; empty for a line that is not a counter,
	// such as "From ../origin" or " * [new branch] main -> origin/main".
	Phase string `json:"phase"`
	// Percent is how far Phase is, 0 to 100; -1 when the line has no
	// percentage.
	Percent int `json:"percent"`
	// Text is the whole line without surrounding whitespace.
	Text string `json:"text"`
}

// counterLine matches git's progress counters ("Phase:  45% (9/20)...") and
// counters without a known total ("Phase: 1234, done.").
var counterLine = regexp.MustCompile(`^((?:remote: )?[A-Za-z][A-Za-z ]*?):\s+(?:(\d{1,3})%|\d+(?:,|$))`)

// ParseProgress reads one line of git's progress output.
func ParseProgress(line string) Progress {
	text := strings.TrimSpace(line)
	progress := Progress{Percent: -1, Text: text}
	match := counterLine.FindStringSubmatch(text)
	if match == nil {
		return progress
	}
	progress.Phase = match[1]
	if match[2] != "" {
		percent, _ := strconv.Atoi(match[2])
		progress.Percent = min(percent, 100)
	}
	return progress
}

// Reporting wraps runner so every command it runs passes what git prints on
// stderr, line by line, to report while the command runs. Commands that
// should report must ask git for progress (e.g. "fetch --progress"); git
// prints none when stderr is not a terminal otherwise. report must not
// block: it runs on the command's output path.
func Reporting(runner Runner, report func(Progress)) Runner {
	return reportingRunner{next: runner, report: report}
}

type reportingRunner struct {
	next   Runner
	report func(Progress)
}

func (r reportingRunner) Run(ctx context.Context, command *Command) (Result, error) {
	reporting := *command
	reporting.progress = r.report
	return r.next.Run(ctx, &reporting)
}

// progressWriter splits stderr into lines and reports each one. git ends
// in-place updates of a counter with "\r" and finished lines with "\n".
type progressWriter struct {
	mu      sync.Mutex
	report  func(Progress)
	pending []byte
}

func (w *progressWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.pending = append(w.pending, p...)
	for {
		end := bytes.IndexAny(w.pending, "\r\n")
		if end < 0 {
			break
		}
		w.emit(w.pending[:end])
		w.pending = w.pending[end+1:]
	}
	return len(p), nil
}

// flush reports a last line that did not end with a line break.
func (w *progressWriter) flush() {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.emit(w.pending)
	w.pending = nil
}

func (w *progressWriter) emit(line []byte) {
	if len(bytes.TrimSpace(line)) > 0 {
		w.report(ParseProgress(string(line)))
	}
}
