package repo_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gitview/internal/git"
	"gitview/internal/gittest"
	"gitview/internal/repo"
)

func TestOpenFindsTheWorkingTreeRootFromASubdirectory(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("pkg/a.txt", "a\n", "first")

	opened, err := repo.Open(context.Background(), filepath.Join(r.Dir, "pkg"))
	if err != nil {
		t.Fatal(err)
	}
	if opened.Root != r.Dir {
		t.Fatalf("root = %q, want %q", opened.Root, r.Dir)
	}
	if opened.GitDir != filepath.Join(r.Dir, ".git") {
		t.Fatalf("git dir = %q", opened.GitDir)
	}
	if opened.Name() != filepath.Base(r.Dir) {
		t.Fatalf("name = %q", opened.Name())
	}
}

func TestOpenAcceptsAnEmptyRepository(t *testing.T) {
	r := gittest.Init(t)
	if _, err := repo.Open(context.Background(), r.Dir); err != nil {
		t.Fatal(err)
	}
}

func TestOpenExplainsWhenThePathIsNotARepository(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("GIT_CEILING_DIRECTORIES", filepath.Dir(dir))

	_, err := repo.Open(context.Background(), dir)
	if !errors.Is(err, git.NotRepository) {
		t.Fatalf("expected NotRepository, got %v", err)
	}
	for _, want := range []string{dir, "git init", "gitview <path>"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("message %q should mention %q", err, want)
		}
	}
}

func TestOpenExplainsWhenThePathDoesNotExist(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing")
	_, err := repo.Open(context.Background(), missing)
	if err == nil || !strings.Contains(err.Error(), "does not exist") || !strings.Contains(err.Error(), missing) {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestOpenRejectsBareRepositories(t *testing.T) {
	dir := t.TempDir()
	r := gittest.Init(t)
	r.Git("init", "--quiet", "--bare", dir)

	_, err := repo.Open(context.Background(), dir)
	if err == nil || !strings.Contains(err.Error(), "bare") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestOpenRejectsAFile(t *testing.T) {
	file := filepath.Join(t.TempDir(), "file.txt")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := repo.Open(context.Background(), file)
	if err == nil || !strings.Contains(err.Error(), "not a directory") {
		t.Fatalf("unexpected error: %v", err)
	}
}
