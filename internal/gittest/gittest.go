// Package gittest builds real git repositories in temporary directories for
// tests. Tests describe repository state with ordinary git commands and then
// assert on gitview's behavior; git itself is never mocked.
package gittest

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Repo is a scratch repository rooted at Dir.
type Repo struct {
	t   testing.TB
	Dir string
}

// Init creates an empty repository whose unborn branch is "main", with a
// fixed committer identity so commits are reproducible.
func Init(t testing.TB) *Repo {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	repo := &Repo{t: t, Dir: dir}
	repo.Git("init", "--quiet", "--initial-branch=main")
	repo.Git("config", "user.name", "Ada Lovelace")
	repo.Git("config", "user.email", "ada@example.com")
	repo.Git("config", "commit.gpgsign", "false")
	return repo
}

// Git runs git in the repository and returns trimmed stdout. Any failure
// fails the test.
func (r *Repo) Git(args ...string) string {
	r.t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = r.Dir
	cmd.Env = append(os.Environ(),
		"LC_ALL=C",
		"GIT_CONFIG_NOSYSTEM=1",
		"GIT_AUTHOR_DATE=2026-01-02T10:00:00Z",
		"GIT_COMMITTER_DATE=2026-01-02T10:00:00Z",
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		r.t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, output)
	}
	return strings.TrimSpace(string(output))
}

// GitFails runs git and expects it to fail, for building conflicted or
// otherwise in-progress states. It returns the combined output.
func (r *Repo) GitFails(args ...string) string {
	r.t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = r.Dir
	cmd.Env = append(os.Environ(), "LC_ALL=C", "GIT_CONFIG_NOSYSTEM=1", "GIT_EDITOR=true")
	output, err := cmd.CombinedOutput()
	if err == nil {
		r.t.Fatalf("git %s unexpectedly succeeded:\n%s", strings.Join(args, " "), output)
	}
	return string(output)
}

// Write creates or replaces a file relative to the repository root.
func (r *Repo) Write(path, content string) {
	r.t.Helper()
	full := filepath.Join(r.Dir, path)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		r.t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		r.t.Fatal(err)
	}
}

// Commit writes path with content, stages everything and commits it. It
// returns the new HEAD commit id.
func (r *Repo) Commit(path, content, message string) string {
	r.t.Helper()
	r.Write(path, content)
	r.Git("add", "--all")
	r.Git("commit", "--quiet", "-m", message)
	return r.Git("rev-parse", "HEAD")
}
