package overview_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"gitview/internal/gitrepo"
	"gitview/internal/overview"
)

func TestRealGitHistoryAppliesMailmapAndExcludesMergeDiff(t *testing.T) {
	dir := t.TempDir()
	runGit(t, dir, nil, "init", "-b", "main")
	writeFile(t, filepath.Join(dir, ".mailmap"), "Canonical <canonical@example.com> Alias <alias@example.com>\n")
	writeFile(t, filepath.Join(dir, "base.txt"), "base\n")
	runGit(t, dir, identity("Alias", "alias@example.com"), "add", ".")
	runGit(t, dir, identity("Alias", "alias@example.com"), "commit", "-m", "base")

	runGit(t, dir, nil, "checkout", "-b", "feature")
	writeFile(t, filepath.Join(dir, "feature.txt"), "feature\n")
	runGit(t, dir, identity("Alias", "alias@example.com"), "add", "feature.txt")
	runGit(t, dir, identity("Alias", "alias@example.com"), "commit", "-m", "feature")

	runGit(t, dir, nil, "checkout", "main")
	writeFile(t, filepath.Join(dir, "main.txt"), "main\n")
	runGit(t, dir, identity("Canonical", "canonical@example.com"), "add", "main.txt")
	runGit(t, dir, identity("Canonical", "canonical@example.com"), "commit", "-m", "main")
	runGit(t, dir, identity("Canonical", "canonical@example.com"), "merge", "--no-ff", "feature", "-m", "merge")

	repository, err := gitrepo.Open(context.Background(), dir)
	if err != nil {
		t.Fatal(err)
	}
	report, err := overview.NewService(repository).Overview(context.Background(), overview.Filters{})
	if err != nil {
		t.Fatal(err)
	}
	if report.Totals.Commits != 4 || report.Totals.Contributors != 1 {
		t.Fatalf("unexpected identity totals: %+v", report.Totals)
	}
	if report.Totals.Additions != 4 || report.Totals.Deletions != 0 || report.Totals.Churn != 4 {
		t.Fatalf("merge diff should not be counted: %+v", report.Totals)
	}
	detail, err := overview.NewService(repository).Contributor(context.Background(), overview.Filters{}, report.Contributors[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Contributor.Commits != 4 || len(detail.TopPaths) != 4 {
		t.Fatalf("unexpected contributor detail: %+v", detail)
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func runGit(t *testing.T, dir string, env []string, args ...string) {
	t.Helper()
	command := exec.Command("git", append([]string{"-C", dir, "-c", "commit.gpgsign=false"}, args...)...)
	command.Env = append(os.Environ(), env...)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, output)
	}
}

func identity(name, email string) []string {
	return []string{
		"GIT_AUTHOR_NAME=" + name,
		"GIT_AUTHOR_EMAIL=" + email,
		"GIT_AUTHOR_DATE=2026-01-02T10:00:00Z",
		"GIT_COMMITTER_NAME=" + name,
		"GIT_COMMITTER_EMAIL=" + email,
		"GIT_COMMITTER_DATE=2026-01-02T10:00:00Z",
	}
}
