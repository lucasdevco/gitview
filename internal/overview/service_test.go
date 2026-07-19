package overview

import (
	"context"
	"testing"
	"time"
)

type fakeGit struct {
	repository Repository
	log        string
	shallow    bool
}

func (f fakeGit) Repository(context.Context) (Repository, error) { return f.repository, nil }
func (f fakeGit) Commits(context.Context) ([]byte, error)        { return []byte(f.log), nil }
func (f fakeGit) IsShallow(context.Context) (bool, error)        { return f.shallow, nil }

func TestOverviewAggregatesHistory(t *testing.T) {
	t.Setenv("TZ", "UTC")
	service := NewService(fakeGit{
		repository: Repository{Name: "sample", Root: "/sample", Branch: "main", Head: "bbb"},
		log: "\x1ebbb\x1fAda\x1fada@example.com\x1f2026-02-02T10:00:00Z\x1fSecond\n3\t1\tb.go\n" +
			"\x1eaaa\x1fAda\x1fADA@example.com\x1f2026-01-02T10:00:00Z\x1fFirst\n5\t0\ta.go\n-\t-\timage.png\n",
	})
	service.now = func() time.Time { return time.Date(2026, 2, 3, 0, 0, 0, 0, time.UTC) }

	report, err := service.Overview(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if report.Totals.Commits != 2 || report.Totals.Contributors != 1 {
		t.Fatalf("unexpected counts: %+v", report.Totals)
	}
	if report.Totals.Additions != 8 || report.Totals.Deletions != 1 || report.Totals.Churn != 9 {
		t.Fatalf("unexpected line totals: %+v", report.Totals)
	}
	if len(report.MonthlyActivity) != 2 || report.MonthlyActivity[0].Month != "2026-01" {
		t.Fatalf("unexpected months: %+v", report.MonthlyActivity)
	}
	if len(report.RecentCommits) != 2 || report.RecentCommits[0].OID != "bbb" {
		t.Fatalf("unexpected recent commits: %+v", report.RecentCommits)
	}
	if report.AnalysisContext.Timezone == "" || report.AnalysisContext.Timezone == "Local" {
		t.Fatalf("expected explicit timezone, got %q", report.AnalysisContext.Timezone)
	}
}

func TestEmptyRepositoryReturnsEmptyCollections(t *testing.T) {
	service := NewService(fakeGit{repository: Repository{Name: "empty", Empty: true}})
	report, err := service.Overview(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if report.Totals.Commits != 0 || report.MonthlyActivity == nil || report.Contributors == nil || report.RecentCommits == nil {
		t.Fatalf("unexpected empty report: %+v", report)
	}
}
