package git

import (
	"fmt"
	"strings"
)

// ErrorKind names a class of git failure that callers can act on. Use it with
// errors.Is: errors.Is(err, git.NotRepository). The string value is stable and
// doubles as the API error code.
type ErrorKind string

const (
	NotInstalled         ErrorKind = "git_not_installed"
	NotRepository        ErrorKind = "not_a_repository"
	LockConflict         ErrorKind = "lock_conflict"
	AuthenticationFailed ErrorKind = "authentication_failed"
	Conflict             ErrorKind = "conflict"
	RefNotFound          ErrorKind = "ref_not_found"
	PushRejected         ErrorKind = "push_rejected"
	UnsupportedVersion   ErrorKind = "unsupported_git_version"
	// Failed is any git failure that does not match a more specific kind.
	Failed ErrorKind = "git_failed"
)

func (k ErrorKind) Error() string { return string(k) }

// Error is a failed git invocation.
type Error struct {
	Kind     ErrorKind
	Command  string // display form, e.g. "git rev-parse HEAD"
	ExitCode int    // -1 when git did not run
	Stderr   string
	Err      error // underlying process error, if any
}

func (e *Error) Error() string {
	detail := strings.TrimSpace(e.Stderr)
	if detail == "" && e.Err != nil {
		detail = e.Err.Error()
	}
	if detail == "" {
		detail = fmt.Sprintf("exit status %d", e.ExitCode)
	}
	return fmt.Sprintf("%s: %s", e.Command, detail)
}

// Is matches the error's kind, so errors.Is(err, git.LockConflict) works.
func (e *Error) Is(target error) bool {
	kind, ok := target.(ErrorKind)
	return ok && kind == e.Kind
}

func (e *Error) Unwrap() error { return e.Err }

// classifications are checked in order; git runs with LC_ALL=C so messages
// are stable English text.
var classifications = []struct {
	kind     ErrorKind
	patterns []string
}{
	{NotRepository, []string{"not a git repository"}},
	{LockConflict, []string{".lock': File exists"}},
	{AuthenticationFailed, []string{
		"Authentication failed",
		"could not read Username",
		"could not read Password",
		"terminal prompts disabled",
		"Permission denied (publickey",
	}},
	{PushRejected, []string{"[rejected]", "[remote rejected]", "failed to push some refs"}},
	{Conflict, []string{"CONFLICT (", "Automatic merge failed", "fix conflicts and then commit"}},
	{RefNotFound, []string{
		"unknown revision or path not in the working tree",
		"Not a valid object name",
		"not a valid ref",
		"Needed a single revision",
		"couldn't find remote ref",
		"invalid reference:",
	}},
}

func classify(stderr string) ErrorKind {
	for _, class := range classifications {
		for _, pattern := range class.patterns {
			if strings.Contains(stderr, pattern) {
				return class.kind
			}
		}
	}
	return Failed
}
