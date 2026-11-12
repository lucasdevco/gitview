package git

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"time"
)

// Runner executes git commands. Higher layers depend on this interface so
// cross-cutting behavior (command log, index.lock retry, write serialization)
// can be added by wrapping a Runner instead of touching every caller.
type Runner interface {
	Run(ctx context.Context, command *Command) (Result, error)
}

// Result is the outcome of a successful command.
type Result struct {
	Stdout   []byte
	Stderr   []byte
	Duration time.Duration
}

// ExecRunner runs commands with the system git binary in one directory.
type ExecRunner struct {
	dir        string
	executable string
}

// Option configures an ExecRunner.
type Option func(*ExecRunner)

// WithExecutable runs the given git binary instead of "git" from PATH.
func WithExecutable(path string) Option {
	return func(r *ExecRunner) { r.executable = path }
}

// NewRunner returns a Runner that executes git in dir.
func NewRunner(dir string, options ...Option) *ExecRunner {
	runner := &ExecRunner{dir: dir, executable: "git"}
	for _, option := range options {
		option(runner)
	}
	return runner
}

// Dir is the directory commands run in.
func (r *ExecRunner) Dir() string { return r.dir }

// Run executes command and returns its output. A non-zero exit or a failure to
// start git is returned as *Error with a classified Kind.
func (r *ExecRunner) Run(ctx context.Context, command *Command) (Result, error) {
	cmd := exec.CommandContext(ctx, r.executable, command.args...)
	cmd.Dir = r.dir
	if command.input != nil {
		// A fresh reader per run, so a retried command reads the input again.
		cmd.Stdin = bytes.NewReader(command.input)
	}
	cmd.Env = environment(command.write)
	// On cancellation, interrupt git instead of killing it so it can remove
	// its lock files; kill only if it has not exited shortly after.
	cmd.Cancel = func() error { return cmd.Process.Signal(os.Interrupt) }
	cmd.WaitDelay = 5 * time.Second
	var trace *hookTrace
	if command.write {
		if trace = newHookTrace(); trace != nil {
			cmd.Env = append(cmd.Env, trace.env())
			defer trace.remove()
		}
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if command.progress != nil {
		progress := &progressWriter{report: command.progress}
		defer progress.flush()
		cmd.Stderr = io.MultiWriter(&stderr, progress)
	}

	started := time.Now()
	err := cmd.Run()
	result := Result{Stdout: stdout.Bytes(), Stderr: stderr.Bytes(), Duration: time.Since(started)}
	if err == nil {
		return result, nil
	}
	gitErr := &Error{Command: command.String(), ExitCode: -1, Stderr: stderr.String(), Stdout: stdout.String(), Err: err}
	var exitErr *exec.ExitError
	switch {
	case ctx.Err() != nil:
		gitErr.Kind = Failed
		gitErr.Err = ctx.Err()
	case errors.As(err, &exitErr):
		gitErr.ExitCode = exitErr.ExitCode()
		gitErr.Kind = classify(gitErr.Stderr, gitErr.Stdout)
		// A failed hook decides the outcome even when its output happens to
		// match another kind (a failed pre-push also says "failed to push").
		if trace != nil {
			if hook := trace.failedHook(); hook != "" {
				gitErr.Kind, gitErr.Hook = HookFailed, hook
			}
		}
	case errors.Is(err, exec.ErrNotFound) || errors.Is(err, os.ErrNotExist):
		gitErr.Kind = NotInstalled
		gitErr.Stderr = "git executable not found; install git and make sure it is on PATH"
	default:
		gitErr.Kind = Failed
	}
	return result, gitErr
}

// environment returns the process environment for a git command: the current
// environment plus gitview's fixed settings. LC_ALL=C keeps output parseable,
// GIT_TERMINAL_PROMPT=0 stops git from blocking on a terminal nobody sees, and
// read commands set GIT_OPTIONAL_LOCKS=0 so they never take index.lock.
func environment(write bool) []string {
	env := append(os.Environ(), "LC_ALL=C", "GIT_TERMINAL_PROMPT=0")
	if !write {
		env = append(env, "GIT_OPTIONAL_LOCKS=0")
	}
	return env
}
