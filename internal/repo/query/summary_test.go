package query_test

import (
	"context"
	"path/filepath"
	"testing"

	"gitview/internal/gittest"
	"gitview/internal/repo"
	"gitview/internal/repo/query"
)

func summarize(t *testing.T, r *gittest.Repo) query.Summary {
	t.Helper()
	opened, err := repo.Open(context.Background(), r.Dir)
	if err != nil {
		t.Fatal(err)
	}
	summary, err := query.Summarize(context.Background(), opened)
	if err != nil {
		t.Fatal(err)
	}
	return summary
}

func TestSummaryOfARepositoryWithHistory(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "one\n", "first")
	head := r.Commit("a.txt", "two\n", "second")

	got := summarize(t, r)
	want := query.Summary{
		Name:     filepath.Base(r.Dir),
		Root:     r.Dir,
		Branch:   "main",
		Head:     head,
		State:    query.StateClean,
		Identity: query.Identity{Name: "Ada Lovelace", Email: "ada@example.com"},
	}
	if got != want {
		t.Fatalf("summary mismatch:\n got %+v\nwant %+v", got, want)
	}
}

func TestSummaryOfAnEmptyRepository(t *testing.T) {
	r := gittest.Init(t)

	got := summarize(t, r)
	if !got.Empty || got.Head != "" || got.Branch != "main" || got.Detached || got.State != query.StateClean {
		t.Fatalf("unexpected summary: %+v", got)
	}
}

func TestSummaryOfADetachedHead(t *testing.T) {
	r := gittest.Init(t)
	first := r.Commit("a.txt", "one\n", "first")
	r.Commit("a.txt", "two\n", "second")
	r.Git("checkout", "--quiet", "--detach", first)

	got := summarize(t, r)
	if !got.Detached || got.Branch != "" || got.Head != first || got.Empty {
		t.Fatalf("unexpected summary: %+v", got)
	}
}

func TestSummaryWithoutConfiguredIdentity(t *testing.T) {
	r := gittest.Init(t)
	r.Git("config", "--unset", "user.name")
	r.Git("config", "--unset", "user.email")
	t.Setenv("GIT_CONFIG_GLOBAL", filepath.Join(t.TempDir(), "none"))
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")

	got := summarize(t, r)
	if got.Identity != (query.Identity{}) {
		t.Fatalf("expected no identity, got %+v", got.Identity)
	}
}

// diverged builds main and topic branches that both change a.txt, so merging,
// rebasing, cherry-picking or reverting across them stops on a conflict.
func diverged(t *testing.T) (*gittest.Repo, string) {
	r := gittest.Init(t)
	r.Commit("a.txt", "base\n", "base")
	r.Git("branch", "topic")
	r.Commit("a.txt", "main\n", "main change")
	r.Git("checkout", "--quiet", "topic")
	topic := r.Commit("a.txt", "topic\n", "topic change")
	r.Git("checkout", "--quiet", "main")
	return r, topic
}

func TestSummaryReportsInProgressOperations(t *testing.T) {
	cases := []struct {
		name  string
		start func(r *gittest.Repo, topic string)
		want  query.State
	}{
		{"merge", func(r *gittest.Repo, _ string) { r.GitFails("merge", "topic") }, query.StateMerging},
		{"rebase", func(r *gittest.Repo, _ string) { r.GitFails("rebase", "topic") }, query.StateRebasing},
		{"cherry-pick", func(r *gittest.Repo, topic string) { r.GitFails("cherry-pick", topic) }, query.StateCherryPicking},
		{"revert", func(r *gittest.Repo, _ string) {
			r.Commit("a.txt", "later\n", "later")
			r.GitFails("revert", "--no-edit", "HEAD~1")
		}, query.StateReverting},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r, topic := diverged(t)
			tc.start(r, topic)
			if got := summarize(t, r).State; got != tc.want {
				t.Fatalf("state = %q, want %q", got, tc.want)
			}
		})
	}
}
