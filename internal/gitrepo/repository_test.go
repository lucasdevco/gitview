package gitrepo

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestRepositoryReadsMailmapAndRootCommit(t *testing.T) {
	dir := t.TempDir()
	runGit(t, dir, nil, "init", "-b", "main")
	if err := os.WriteFile(filepath.Join(dir, "one.txt"), []byte("one\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, authorEnv("Alias", "alias@example.com", "2026-01-02T10:00:00Z"), "add", "one.txt")
	runGit(t, dir, authorEnv("Alias", "alias@example.com", "2026-01-02T10:00:00Z"), "commit", "-m", "first")
	mailmap := "Canonical <canonical@example.com> Alias <alias@example.com>\n"
	if err := os.WriteFile(filepath.Join(dir, ".mailmap"), []byte(mailmap), 0o600); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, authorEnv("Canonical", "canonical@example.com", "2026-02-02T10:00:00Z"), "add", ".mailmap")
	runGit(t, dir, authorEnv("Canonical", "canonical@example.com", "2026-02-02T10:00:00Z"), "commit", "-m", "mailmap")

	repository, err := Open(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	meta, err := repository.Repository(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if meta.Branch != "main" || meta.Head == "" || meta.Empty {
		t.Fatalf("unexpected metadata: %+v", meta)
	}
	var log bytes.Buffer
	err = repository.Commits(context.Background(), "", &log)
	if err != nil {
		t.Fatal(err)
	}
	if log.Len() == 0 {
		t.Fatal("expected history output")
	}
	var filtered bytes.Buffer
	err = repository.Commits(context.Background(), "one.txt", &filtered)
	if err != nil {
		t.Fatal(err)
	}
	if records := bytes.Count(filtered.Bytes(), []byte{'\x1e'}); records != 1 {
		t.Fatalf("expected one path-filtered commit, got %d", records)
	}
	patch, err := repository.CommitPatch(context.Background(), meta.Head)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(patch, "mailmap") || !strings.Contains(patch, "diff --git") {
		t.Fatalf("unexpected commit patch: %s", patch)
	}
}

func TestOpenRejectsNonRepository(t *testing.T) {
	if _, err := Open(context.Background(), t.TempDir()); err == nil {
		t.Fatal("expected non-repository error")
	}
}

func TestRepositoryListsTrackedDirectories(t *testing.T) {
	dir := t.TempDir()
	runGit(t, dir, nil, "init", "-b", "main")
	if err := os.MkdirAll(filepath.Join(dir, "internal", "parser"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "internal", "parser", "parse.go"), []byte("package parser\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, authorEnv("Ada", "ada@example.com", "2026-01-02T10:00:00Z"), "add", ".")
	runGit(t, dir, authorEnv("Ada", "ada@example.com", "2026-01-02T10:00:00Z"), "commit", "-m", "add parser")
	repository, err := Open(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	root, err := repository.Directories(context.Background(), "")
	if err != nil || len(root) != 1 || root[0] != "internal" {
		t.Fatalf("unexpected root directories: %#v, %v", root, err)
	}
	children, err := repository.Directories(context.Background(), "internal")
	if err != nil || len(children) != 1 || children[0] != "internal/parser" {
		t.Fatalf("unexpected child directories: %#v, %v", children, err)
	}
}

func TestRepositoryReadsBranchGraphAndWorkingTree(t *testing.T) {
	dir := t.TempDir()
	runGit(t, dir, nil, "init", "-b", "main")
	file := filepath.Join(dir, "app.go")
	if err := os.WriteFile(file, []byte("package main\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, authorEnv("Ada", "ada@example.com", "2026-01-02T10:00:00Z"), "add", "app.go")
	runGit(t, dir, authorEnv("Ada", "ada@example.com", "2026-01-02T10:00:00Z"), "commit", "-m", "add app")
	runGit(t, dir, nil, "branch", "feature/parser")
	if err := os.WriteFile(file, []byte("package main\n\nfunc main() {}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "new.go"), []byte("package main\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	repository, err := Open(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	branches, err := repository.Branches(context.Background())
	if err != nil || len(branches) != 2 || !branches[1].Current {
		t.Fatalf("unexpected branches: %#v, %v", branches, err)
	}
	commits, err := repository.BranchCommits(context.Background(), "refs/heads/feature/parser", 20)
	if err != nil || len(commits) != 1 || commits[0].Subject != "add app" {
		t.Fatalf("unexpected commits: %#v, %v", commits, err)
	}
	workingTree, err := repository.WorkingTree(context.Background())
	if err != nil || !workingTree.Dirty || len(workingTree.Files) != 2 || !strings.Contains(workingTree.Patch, "+func main()") || !strings.Contains(workingTree.Patch, "new.go") {
		t.Fatalf("unexpected working tree: %#v, %v", workingTree, err)
	}
}

func TestRepositoryReadsAheadAndBehindFromUpstream(t *testing.T) {
	dir := t.TempDir()
	runGit(t, dir, nil, "init", "-b", "main")
	file := filepath.Join(dir, "app.go")
	if err := os.WriteFile(file, []byte("package main\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, authorEnv("Ada", "ada@example.com", "2026-01-01T10:00:00Z"), "add", "app.go")
	runGit(t, dir, authorEnv("Ada", "ada@example.com", "2026-01-01T10:00:00Z"), "commit", "-m", "base")
	runGit(t, dir, nil, "branch", "remote-work")
	runGit(t, dir, nil, "checkout", "remote-work")
	if err := os.WriteFile(filepath.Join(dir, "remote.go"), []byte("package main\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, authorEnv("Ada", "ada@example.com", "2026-01-02T10:00:00Z"), "add", "remote.go")
	runGit(t, dir, authorEnv("Ada", "ada@example.com", "2026-01-02T10:00:00Z"), "commit", "-m", "remote")
	remoteOID := strings.TrimSpace(gitOutput(t, dir, "rev-parse", "HEAD"))
	runGit(t, dir, nil, "checkout", "main")
	if err := os.WriteFile(filepath.Join(dir, "local.go"), []byte("package main\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, authorEnv("Ada", "ada@example.com", "2026-01-03T10:00:00Z"), "add", "local.go")
	runGit(t, dir, authorEnv("Ada", "ada@example.com", "2026-01-03T10:00:00Z"), "commit", "-m", "local")
	runGit(t, dir, nil, "update-ref", "refs/remotes/origin/main", remoteOID)
	runGit(t, dir, nil, "branch", "-D", "remote-work")
	runGit(t, dir, nil, "remote", "add", "origin", dir)
	runGit(t, dir, nil, "config", "branch.main.remote", "origin")
	runGit(t, dir, nil, "config", "branch.main.merge", "refs/heads/main")

	repository, err := Open(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	branches, err := repository.Branches(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, branch := range branches {
		if branch.Name == "main" {
			if branch.Upstream != "origin/main" || branch.Ahead != 1 || branch.Behind != 1 {
				t.Fatalf("unexpected tracking status: %+v", branch)
			}
			return
		}
	}
	t.Fatal("main branch not found")
}

func TestRepositoryRecognizesUnbornHEADAsEmpty(t *testing.T) {
	dir := t.TempDir()
	runGit(t, dir, nil, "init", "-b", "main")
	if err := os.WriteFile(filepath.Join(dir, "staged.txt"), []byte("staged\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runGit(t, dir, nil, "add", "staged.txt")

	repository, err := Open(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	metadata, err := repository.Repository(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !metadata.Empty || metadata.Branch != "main" || metadata.Head != "" {
		t.Fatalf("unexpected metadata: %+v", metadata)
	}
}

func runGit(t *testing.T, dir string, env []string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	cmd.Env = append(os.Environ(), env...)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, output)
	}
}

func gitOutput(t *testing.T, dir string, args ...string) string {
	t.Helper()
	output, err := exec.Command("git", append([]string{"-C", dir}, args...)...).CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, output)
	}
	return string(output)
}

func authorEnv(name, email, date string) []string {
	return []string{
		"GIT_AUTHOR_NAME=" + name, "GIT_AUTHOR_EMAIL=" + email, "GIT_AUTHOR_DATE=" + date,
		"GIT_COMMITTER_NAME=" + name, "GIT_COMMITTER_EMAIL=" + email, "GIT_COMMITTER_DATE=" + date,
	}
}
