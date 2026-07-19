package gitrepo

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
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
	log, err := repository.Commits(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(log) == 0 {
		t.Fatal("expected history output")
	}
}

func TestOpenRejectsNonRepository(t *testing.T) {
	if _, err := Open(context.Background(), t.TempDir()); err == nil {
		t.Fatal("expected non-repository error")
	}
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

func authorEnv(name, email, date string) []string {
	return []string{
		"GIT_AUTHOR_NAME=" + name, "GIT_AUTHOR_EMAIL=" + email, "GIT_AUTHOR_DATE=" + date,
		"GIT_COMMITTER_NAME=" + name, "GIT_COMMITTER_EMAIL=" + email, "GIT_COMMITTER_DATE=" + date,
	}
}
