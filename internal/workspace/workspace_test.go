package workspace_test

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"gitview/internal/git"
	"gitview/internal/gittest"
	"gitview/internal/workspace"
)

// open returns a new workspace that is closed when the test ends.
func open(t *testing.T) *workspace.Workspace {
	t.Helper()
	ws := workspace.New()
	t.Cleanup(ws.Close)
	return ws
}

func TestOpeningTheSameRepositoryTwiceReturnsOneInstance(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("pkg/a.txt", "a\n", "first")
	ws := open(t)

	first, err := ws.Open(context.Background(), r.Dir)
	if err != nil {
		t.Fatal(err)
	}
	second, err := ws.Open(context.Background(), filepath.Join(r.Dir, "pkg"))
	if err != nil {
		t.Fatal(err)
	}
	if first != second || len(ws.Repos()) != 1 {
		t.Fatalf("expected one shared instance, got %d repos", len(ws.Repos()))
	}
	if found, ok := ws.Repo(first.ID); !ok || found != first {
		t.Fatal("repository should be found by its ID")
	}
}

func TestRepositoryIDIsStableAndURLSafe(t *testing.T) {
	r := gittest.Init(t)
	a, err := open(t).Open(context.Background(), r.Dir)
	if err != nil {
		t.Fatal(err)
	}
	b, err := open(t).Open(context.Background(), r.Dir)
	if err != nil {
		t.Fatal(err)
	}
	if a.ID != b.ID || a.ID == "" {
		t.Fatalf("IDs differ across workspaces: %q vs %q", a.ID, b.ID)
	}
	for _, c := range a.ID {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9') {
			t.Fatalf("ID %q is not URL-safe", a.ID)
		}
	}
}

// Queries get the repository through Reader, whose runner refuses write
// commands: a write can only run through Repo.Write or a job, under the
// write lock.
func TestTheReaderRunsReadCommandsAndRefusesWrites(t *testing.T) {
	r := gittest.Init(t)
	head := r.Commit("a.txt", "a\n", "first")
	opened, err := open(t).Open(context.Background(), r.Dir)
	if err != nil {
		t.Fatal(err)
	}
	reader := opened.Reader()
	if reader.Root != r.Dir || opened.Root() != r.Dir {
		t.Fatalf("root = %q / %q, want %q", reader.Root, opened.Root(), r.Dir)
	}

	result, err := reader.Runner.Run(context.Background(), git.Read("rev-parse", "HEAD"))
	if err != nil || strings.TrimSpace(string(result.Stdout)) != head {
		t.Fatalf("read: %q, %v", result.Stdout, err)
	}
	if _, err := reader.Runner.Run(context.Background(), git.Write("branch", "sneaky")); err == nil {
		t.Fatal("the reader ran a write command")
	}
	if branches := r.Git("branch", "--list", "sneaky"); branches != "" {
		t.Fatalf("branch was created: %q", branches)
	}
}

func TestUnknownRepositoryIsNotFound(t *testing.T) {
	if _, ok := open(t).Repo("missing"); ok {
		t.Fatal("expected no repository")
	}
}

func TestOpenFailureLeavesWorkspaceEmpty(t *testing.T) {
	ws := open(t)
	if _, err := ws.Open(context.Background(), filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("expected error")
	}
	if len(ws.Repos()) != 0 {
		t.Fatal("failed open should not add a repository")
	}
}
