package git_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gitview/internal/git"
)

// fakeGit writes an executable that stands in for git, so tests can observe
// exactly what the runner hands to the process.
func fakeGit(t *testing.T, script string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "git")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+script), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func envOf(stdout []byte) map[string]string {
	env := map[string]string{}
	for _, line := range strings.Split(string(stdout), "\n") {
		if key, value, ok := strings.Cut(line, "="); ok {
			env[key] = value
		}
	}
	return env
}

func TestReadCommandsRunWithStableEnvironmentAndNoOptionalLocks(t *testing.T) {
	t.Setenv("LC_ALL", "zh_CN.UTF-8")
	t.Setenv("GIT_TERMINAL_PROMPT", "1")
	runner := git.NewRunner(t.TempDir(), git.WithExecutable(fakeGit(t, "env\n")))

	result, err := runner.Run(context.Background(), git.Read("status"))
	if err != nil {
		t.Fatal(err)
	}
	env := envOf(result.Stdout)
	if env["LC_ALL"] != "C" || env["GIT_TERMINAL_PROMPT"] != "0" || env["GIT_OPTIONAL_LOCKS"] != "0" {
		t.Fatalf("unexpected environment: LC_ALL=%q GIT_TERMINAL_PROMPT=%q GIT_OPTIONAL_LOCKS=%q",
			env["LC_ALL"], env["GIT_TERMINAL_PROMPT"], env["GIT_OPTIONAL_LOCKS"])
	}
}

func TestWithEnvAddsVariablesThatNeverAppearInTheCommand(t *testing.T) {
	t.Setenv("GIT_ASKPASS", "/usr/bin/somebody-elses-helper")
	runner := git.WithEnv(git.NewRunner(t.TempDir(), git.WithExecutable(fakeGit(t, "env\n"))),
		"GIT_ASKPASS=/opt/gitview", "SECRET_FOR_HELPER=s3cret")
	command := git.Write("push", "origin")

	result, err := runner.Run(context.Background(), command)
	if err != nil {
		t.Fatal(err)
	}
	env := envOf(result.Stdout)
	// Added variables win over inherited ones.
	if env["GIT_ASKPASS"] != "/opt/gitview" || env["SECRET_FOR_HELPER"] != "s3cret" || env["LC_ALL"] != "C" {
		t.Fatalf("unexpected environment: %v", env)
	}
	if got := command.String(); got != "git push origin" {
		t.Fatalf("String() = %q", got)
	}
}

func TestWriteCommandsMayTakeOptionalLocks(t *testing.T) {
	t.Setenv("GIT_OPTIONAL_LOCKS", "")
	runner := git.NewRunner(t.TempDir(), git.WithExecutable(fakeGit(t, "env\n")))

	result, err := runner.Run(context.Background(), git.Write("commit"))
	if err != nil {
		t.Fatal(err)
	}
	env := envOf(result.Stdout)
	if env["LC_ALL"] != "C" || env["GIT_TERMINAL_PROMPT"] != "0" {
		t.Fatalf("write command missing stable environment: %v", env)
	}
	if env["GIT_OPTIONAL_LOCKS"] == "0" {
		t.Fatal("write commands must not disable optional locks")
	}
}

// git's trace2 events (read to detect failed hooks) include the argv of
// every process git starts, which can contain a remote URL with a token.
// They go to a file only the user can read, in a directory only the user can
// enter, and nothing of it remains once the command has finished.
func TestWriteCommandTraceIsPrivateAndRemovedAfterwards(t *testing.T) {
	for _, exit := range []string{"0", "1"} {
		t.Run("exit "+exit, func(t *testing.T) {
			temp := t.TempDir()
			t.Setenv("TMPDIR", temp)
			script := `printf 'path=%s\n' "$GIT_TRACE2_EVENT"
printf 'dir=%s\n' "$(ls -ld "$(dirname "$GIT_TRACE2_EVENT")" | cut -c1-10)"
printf 'file=%s\n' "$(ls -l "$GIT_TRACE2_EVENT" | cut -c1-10)"
exit ` + exit + "\n"
			runner := git.NewRunner(t.TempDir(), git.WithExecutable(fakeGit(t, script)))

			result, err := runner.Run(context.Background(), git.Write("push", "origin"))
			stdout := result.Stdout
			var gitErr *git.Error
			if errors.As(err, &gitErr) {
				stdout = []byte(gitErr.Stdout)
			} else if err != nil {
				t.Fatal(err)
			}
			seen := envOf(stdout)
			if !strings.HasPrefix(seen["path"], temp) || seen["dir"] != "drwx------" || seen["file"] != "-rw-------" {
				t.Fatalf("trace while git ran: %v", seen)
			}
			if left, _ := os.ReadDir(temp); len(left) != 0 {
				t.Fatalf("left behind in the temporary directory: %v", left)
			}
		})
	}
}

func TestBuilderPassesEachArgumentVerbatim(t *testing.T) {
	runner := git.NewRunner(t.TempDir(), git.WithExecutable(fakeGit(t, `for a in "$@"; do printf '%s\n' "$a"; done`+"\n")))
	command := git.Read("log").
		Arg("--format=%H %s").
		ArgIf(false, "--all").
		ArgIf(true, "--first-parent").
		Arg("--", "path with spaces/文件;rm -rf.txt")

	result, err := runner.Run(context.Background(), command)
	if err != nil {
		t.Fatal(err)
	}
	want := "log\n--format=%H %s\n--first-parent\n--\npath with spaces/文件;rm -rf.txt\n"
	if string(result.Stdout) != want {
		t.Fatalf("argv mismatch:\n got %q\nwant %q", result.Stdout, want)
	}
	if got := command.String(); got != "git log '--format=%H %s' --first-parent -- 'path with spaces/文件;rm -rf.txt'" {
		t.Fatalf("unexpected display form: %s", got)
	}
}

func TestRunsInTheRunnerDirectory(t *testing.T) {
	dir := t.TempDir()
	runner := git.NewRunner(dir, git.WithExecutable(fakeGit(t, "pwd -P\n")))
	result, err := runner.Run(context.Background(), git.Read("status"))
	if err != nil {
		t.Fatal(err)
	}
	want, _ := filepath.EvalSymlinks(dir)
	if strings.TrimSpace(string(result.Stdout)) != want {
		t.Fatalf("ran in %q, want %q", result.Stdout, want)
	}
}

func TestFailuresAreClassified(t *testing.T) {
	cases := []struct {
		name   string
		stderr string
		kind   git.ErrorKind
	}{
		{"not a repository", "fatal: not a git repository (or any of the parent directories): .git", git.NotRepository},
		{"index lock", "fatal: Unable to create '/r/.git/index.lock': File exists.\n\nAnother git process seems to be running", git.LockConflict},
		{"https auth", "remote: Invalid username or password.\nfatal: Authentication failed for 'https://example.com/r.git/'", git.AuthenticationFailed},
		{"prompt disabled", "fatal: could not read Username for 'https://example.com': terminal prompts disabled", git.AuthenticationFailed},
		{"ssh auth", "git@example.com: Permission denied (publickey).\nfatal: Could not read from remote repository.", git.AuthenticationFailed},
		{"merge conflict", "CONFLICT (content): Merge conflict in a.txt\nAutomatic merge failed; fix conflicts and then commit the result.", git.Conflict},
		{"unknown revision", "fatal: ambiguous argument 'nope': unknown revision or path not in the working tree.", git.RefNotFound},
		{"invalid object", "fatal: Not a valid object name nope", git.RefNotFound},
		{"push rejected", " ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs to 'origin'", git.PushRejected},
		{"other", "fatal: something unexpected", git.Failed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			script := "cat >&2 <<'EOF'\n" + tc.stderr + "\nEOF\nexit 128\n"
			runner := git.NewRunner(t.TempDir(), git.WithExecutable(fakeGit(t, script)))
			_, err := runner.Run(context.Background(), git.Read("anything"))
			if !errors.Is(err, tc.kind) {
				t.Fatalf("expected %v, got %v", tc.kind, err)
			}
			var gitErr *git.Error
			if !errors.As(err, &gitErr) {
				t.Fatalf("expected *git.Error, got %T", err)
			}
			if gitErr.ExitCode != 128 || !strings.Contains(gitErr.Stderr, strings.Split(tc.stderr, "\n")[0]) {
				t.Fatalf("error lost details: %+v", gitErr)
			}
			if !strings.Contains(err.Error(), "git anything") {
				t.Fatalf("message should name the command: %v", err)
			}
		})
	}
}

func TestConflictsReportedOnStdoutAreClassified(t *testing.T) {
	cases := []struct {
		name   string
		script string
		kind   git.ErrorKind
	}{
		{"conflict on stdout", "echo 'CONFLICT (content): Merge conflict in a.txt'\nexit 1\n", git.Conflict},
		{"stderr decides first", "echo 'CONFLICT (content): Merge conflict in a.txt'\necho 'fatal: not a git repository' >&2\nexit 128\n", git.NotRepository},
		{"other kinds only from stderr", "echo 'fatal: Not a valid object name nope'\nexit 1\n", git.Failed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			runner := git.NewRunner(t.TempDir(), git.WithExecutable(fakeGit(t, tc.script)))
			_, err := runner.Run(context.Background(), git.Write("anything"))
			var gitErr *git.Error
			if !errors.As(err, &gitErr) || gitErr.Kind != tc.kind {
				t.Fatalf("expected %v, got %v", tc.kind, err)
			}
		})
	}
}

func TestMissingExecutableIsReported(t *testing.T) {
	runner := git.NewRunner(t.TempDir(), git.WithExecutable(filepath.Join(t.TempDir(), "no-git")))
	_, err := runner.Run(context.Background(), git.Read("status"))
	if !errors.Is(err, git.NotInstalled) {
		t.Fatalf("expected NotInstalled, got %v", err)
	}
}

func TestRealGitReportsNotRepository(t *testing.T) {
	t.Setenv("GIT_CEILING_DIRECTORIES", os.TempDir())
	runner := git.NewRunner(t.TempDir())
	_, err := runner.Run(context.Background(), git.Read("rev-parse", "--show-toplevel"))
	if !errors.Is(err, git.NotRepository) {
		t.Fatalf("expected NotRepository, got %v", err)
	}
}
