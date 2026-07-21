package overview

import (
	"context"
	"testing"
	"time"
)

func TestCompareAggregatesRevisionRangeWithEvidence(t *testing.T) {
	service := NewService(fakeGit{repository: Repository{Name: "sample", Head: "head"}, rangeLog: "\x1eabc\x1fAda\x1fada@example.com\x1f2026-06-02T10:00:00Z\x1fchange\n4\t2\tinternal/a.go\n"})
	report, err := service.Compare(context.Background(), Filters{}, "v1", "v2")
	if err != nil {
		t.Fatal(err)
	}
	if report.FromRevision != "v1-oid" || report.ToRevision != "v2-oid" || report.Totals.Commits != 1 || report.Totals.Churn != 6 {
		t.Fatalf("unexpected comparison: %+v", report)
	}
	if len(report.Files) != 1 || report.Files[0].Path != "internal/a.go" || len(report.Commits) != 1 {
		t.Fatalf("missing comparison evidence: %+v", report)
	}
	if report.FilesTotal != 1 || report.FilesLimit != 20 || report.FilesHasMore {
		t.Fatalf("unexpected comparison file metadata: %+v", report)
	}
}

func TestExplainBuildsStructuredMonthlyEvidence(t *testing.T) {
	service := NewService(fakeGit{repository: Repository{Name: "sample", Head: "head"}, log: "\x1eabc\x1fAda\x1fada@example.com\x1f2026-06-30T10:00:00+08:00\x1ffeature\n5\t1\tinternal/a.go\n\x1eold\x1fBob\x1fb@example.com\x1f2026-05-31T10:00:00+08:00\x1fold\n9\t0\told.go\n"})
	service.now = func() time.Time { return time.Date(2026, 7, 20, 0, 0, 0, 0, time.Local) }
	report, err := service.Explain(context.Background(), "", "2026-06", time.Local)
	if err != nil {
		t.Fatal(err)
	}
	if report.Month != "2026-06" || report.Totals.Commits != 1 || len(report.Paths) != 1 || len(report.Insights) != 4 {
		t.Fatalf("unexpected explanation: %+v", report)
	}
	if report.Insights[0].Kind != "summary" || report.Insights[0].Values["commits"] != 1 {
		t.Fatalf("unexpected structured insights: %+v", report.Insights)
	}
}

func TestExplainRejectsInvalidMonth(t *testing.T) {
	service := NewService(fakeGit{})
	_, err := service.Explain(context.Background(), "", "June", time.Local)
	filterErr, ok := err.(*FilterError)
	if !ok || filterErr.Code != "invalid_month" {
		t.Fatalf("unexpected error: %v", err)
	}
}
