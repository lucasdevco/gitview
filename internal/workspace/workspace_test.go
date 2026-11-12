package workspace_test

import (
	"context"
	"path/filepath"
	"testing"

	"gitview/internal/gittest"
	"gitview/internal/workspace"
)

func TestOpeningTheSameRepositoryTwiceReturnsOneInstance(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("pkg/a.txt", "a\n", "first")
	ws := workspace.New()

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
	a, err := workspace.New().Open(context.Background(), r.Dir)
	if err != nil {
		t.Fatal(err)
	}
	b, err := workspace.New().Open(context.Background(), r.Dir)
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

func TestUnknownRepositoryIsNotFound(t *testing.T) {
	if _, ok := workspace.New().Repo("missing"); ok {
		t.Fatal("expected no repository")
	}
}

func TestOpenFailureLeavesWorkspaceEmpty(t *testing.T) {
	ws := workspace.New()
	if _, err := ws.Open(context.Background(), filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("expected error")
	}
	if len(ws.Repos()) != 0 {
		t.Fatal("failed open should not add a repository")
	}
}
