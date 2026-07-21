package overview

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"
)

type fakeGit struct {
	repository Repository
	log        string
	shallow    bool
	paths      *[]string
	rangeLog   string
}

func (f fakeGit) Repository(context.Context) (Repository, error) { return f.repository, nil }
func (f fakeGit) Commits(_ context.Context, path string, destination io.Writer) error {
	if f.paths != nil {
		*f.paths = append(*f.paths, path)
	}
	_, err := io.WriteString(destination, f.log)
	return err
}
func (f fakeGit) IsShallow(context.Context) (bool, error) { return f.shallow, nil }
func (f fakeGit) ResolveRevision(_ context.Context, revision string) (string, error) {
	return revision + "-oid", nil
}
func (f fakeGit) CommitsBetween(_ context.Context, _, _ string, _ string, destination io.Writer) error {
	_, err := io.WriteString(destination, f.rangeLog)
	return err
}

func TestOverviewAggregatesHistory(t *testing.T) {
	t.Setenv("TZ", "UTC")
	service := NewService(fakeGit{
		repository: Repository{Name: "sample", Root: "/sample", Branch: "main", Head: "bbb"},
		log: "\x1ebbb\x1fAda\x1fada@example.com\x1f2026-02-02T10:00:00Z\x1fSecond\n3\t1\tb.go\n" +
			"\x1eaaa\x1fAda\x1fADA@example.com\x1f2026-01-02T10:00:00Z\x1fFirst\n5\t0\ta.go\n-\t-\timage.png\n",
	})
	service.now = func() time.Time { return time.Date(2026, 2, 3, 0, 0, 0, 0, time.UTC) }

	report, err := service.Overview(context.Background(), Filters{})
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
	if len(report.MonthlyActivity[0].Contributors) != 1 || report.MonthlyActivity[0].Contributors[0].Name != "Ada" || report.MonthlyActivity[0].Contributors[0].Churn != 5 {
		t.Fatalf("unexpected monthly contributors: %+v", report.MonthlyActivity[0].Contributors)
	}
	if len(report.RecentCommits) != 2 || report.RecentCommits[0].OID != "bbb" {
		t.Fatalf("unexpected recent commits: %+v", report.RecentCommits)
	}
	if report.AnalysisContext.Timezone == "" || report.AnalysisContext.Timezone == "Local" {
		t.Fatalf("expected explicit timezone, got %q", report.AnalysisContext.Timezone)
	}
	if !hasWarning(report, "binary_files_excluded") {
		t.Fatalf("expected binary exclusion warning: %+v", report.Warnings)
	}
}

func TestOverviewDateFiltersDoNotMutateCachedFacts(t *testing.T) {
	service := NewService(fakeGit{
		repository: Repository{Name: "sample", Head: "head"},
		log: "\x1enew\x1fAda\x1fada@example.com\x1f2026-02-02T10:00:00Z\x1fnew\n1\t0\tnew.go\n" +
			"\x1eold\x1fAda\x1fada@example.com\x1f2026-01-02T10:00:00Z\x1fold\n2\t0\told.go\n",
	})
	location := time.UTC
	february, err := ParseFilters("2026-02-01", "2026-02-28", "", location)
	if err != nil {
		t.Fatal(err)
	}
	if report, err := service.Overview(context.Background(), february); err != nil || report.Totals.Commits != 1 {
		t.Fatalf("unexpected February report: %+v, %v", report, err)
	}
	january, err := ParseFilters("2026-01-01", "2026-01-31", "", location)
	if err != nil {
		t.Fatal(err)
	}
	if report, err := service.Overview(context.Background(), january); err != nil || report.Totals.Commits != 1 || report.Totals.Additions != 2 {
		t.Fatalf("cached facts were mutated: %+v, %v", report, err)
	}
	if report, err := service.Overview(context.Background(), Filters{}); err != nil || report.Totals.Commits != 2 || report.Totals.Additions != 3 {
		t.Fatalf("unexpected all-history report: %+v, %v", report, err)
	}
}

func TestOverviewMarksBotsAndWarnsAboutDuplicateNames(t *testing.T) {
	service := NewService(fakeGit{
		repository: Repository{Name: "sample", Head: "bbb"},
		log: "\x1ebbb\x1fdependabot[bot]\x1fbot@example.com\x1f2026-02-01T00:00:00Z\x1fBot\n1\t0\tb.go\n" +
			"\x1eaaa\x1fSame Name\x1fone@example.com\x1f2026-01-02T00:00:00Z\x1fOne\n1\t0\ta.go\n" +
			"\x1e999\x1fSame Name\x1ftwo@example.com\x1f2026-01-01T00:00:00Z\x1fTwo\n1\t0\tc.go\n",
	})
	report, err := service.Overview(context.Background(), Filters{})
	if err != nil {
		t.Fatal(err)
	}
	if !hasWarning(report, "possible_duplicate_identity") {
		t.Fatalf("expected duplicate identity warning: %+v", report.Warnings)
	}
	foundBot := false
	for _, contributor := range report.Contributors {
		foundBot = foundBot || contributor.IsBot
	}
	if !foundBot {
		t.Fatalf("expected bot marker: %+v", report.Contributors)
	}
}

func TestContributorDetailAggregatesPathsAndCommits(t *testing.T) {
	service := NewService(fakeGit{
		repository: Repository{Name: "sample", Root: "/sample", Branch: "main", Head: "bbb"},
		log: "\x1ebbb\x1fAda\x1fada@example.com\x1f2026-02-01T00:00:00Z\x1fSecond\n3\t1\tinternal/a.go\n2\t0\tREADME.md\n" +
			"\x1eaaa\x1fAda\x1fada@example.com\x1f2026-01-01T00:00:00Z\x1fFirst\n5\t0\tinternal/a.go\n" +
			"\x1e999\x1fBob\x1fbob@example.com\x1f2026-01-01T00:00:00Z\x1fOther\n9\t0\tinternal/b.go\n",
	})
	id := personID("ada@example.com")
	report, err := service.Contributor(context.Background(), Filters{}, id)
	if err != nil {
		t.Fatal(err)
	}
	if report.Contributor.ID != id || report.Contributor.Commits != 2 || report.Contributor.Churn != 11 {
		t.Fatalf("unexpected contributor: %+v", report.Contributor)
	}
	if len(report.TopPaths) != 2 || report.TopPaths[0].Path != "internal/a.go" || report.TopPaths[0].Commits != 2 || report.TopPaths[0].Churn != 9 {
		t.Fatalf("unexpected paths: %+v", report.TopPaths)
	}
	if len(report.RecentCommits) != 2 || len(report.MonthlyActivity) != 2 {
		t.Fatalf("unexpected activity: %+v %+v", report.RecentCommits, report.MonthlyActivity)
	}
}

func TestContributorDetailReturnsNotFound(t *testing.T) {
	service := NewService(fakeGit{
		repository: Repository{Name: "sample", Head: "aaa"},
		log:        "\x1eaaa\x1fAda\x1fada@example.com\x1f2026-01-01T00:00:00Z\x1fFirst\n1\t0\ta.go\n",
	})
	_, err := service.Contributor(context.Background(), Filters{}, "missing")
	var notFound *NotFoundError
	if !errors.As(err, &notFound) {
		t.Fatalf("expected not found, got %v", err)
	}
}

func TestOverviewFiltersByInclusiveAuthorDateAndPath(t *testing.T) {
	t.Setenv("TZ", "UTC")
	paths := []string{}
	service := NewService(fakeGit{
		repository: Repository{Name: "sample", Root: "/sample", Branch: "main", Head: "bbb"},
		paths:      &paths,
		log: "\x1ebbb\x1fAda\x1fada@example.com\x1f2026-02-01T00:00:00Z\x1fAfter\n2\t0\tb.go\n" +
			"\x1eaaa\x1fAda\x1fada@example.com\x1f2026-01-31T23:59:59Z\x1fBoundary\n1\t0\ta.go\n",
	})
	filters, err := ParseFilters("2026-01-31", "2026-01-31", "internal/", time.UTC)
	if err != nil {
		t.Fatal(err)
	}
	report, err := service.Overview(context.Background(), filters)
	if err != nil {
		t.Fatal(err)
	}
	if report.Totals.Commits != 1 || report.Totals.Additions != 1 {
		t.Fatalf("unexpected filtered totals: %+v", report.Totals)
	}
	if len(paths) != 1 || paths[0] != "internal" {
		t.Fatalf("path filter was not forwarded: %v", paths)
	}
	if report.AnalysisContext.Filters.Since != "2026-01-31" || report.AnalysisContext.Filters.Path != "internal" {
		t.Fatalf("filters missing from context: %+v", report.AnalysisContext.Filters)
	}
}

func TestOverviewCacheSeparatesFiltersAndInvalidatesOnHEAD(t *testing.T) {
	paths := []string{}
	git := &mutableGit{
		repository: Repository{Name: "sample", Root: "/sample", Branch: "main", Head: "aaa"},
		log:        "\x1eaaa\x1fAda\x1fada@example.com\x1f2026-01-01T00:00:00Z\x1fFirst\n1\t0\ta.go\n",
		paths:      &paths,
	}
	service := NewService(git)
	first, _ := ParseFilters("", "", "a", time.UTC)
	second, _ := ParseFilters("", "", "b", time.UTC)
	if _, err := service.Overview(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Overview(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Overview(context.Background(), second); err != nil {
		t.Fatal(err)
	}
	git.repository.Head = "bbb"
	if _, err := service.Overview(context.Background(), first); err != nil {
		t.Fatal(err)
	}
	if len(paths) != 3 {
		t.Fatalf("expected cache hit plus distinct filter and HEAD misses, calls=%v", paths)
	}
}

type mutableGit struct {
	repository Repository
	log        string
	paths      *[]string
}

func TestOverviewCancelsStreamingGitRead(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	service := NewService(cancelGit{})
	_, err := service.Overview(ctx, Filters{})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected cancellation, got %v", err)
	}
}

type cancelGit struct{}

func (cancelGit) Repository(context.Context) (Repository, error) {
	return Repository{Name: "sample", Head: "aaa"}, nil
}
func (cancelGit) IsShallow(context.Context) (bool, error) { return false, nil }
func (cancelGit) Commits(ctx context.Context, _ string, _ io.Writer) error {
	<-ctx.Done()
	return ctx.Err()
}

func hasWarning(report Report, code string) bool {
	for _, warning := range report.Warnings {
		if warning.Code == code {
			return true
		}
	}
	return false
}

func (f *mutableGit) Repository(context.Context) (Repository, error) { return f.repository, nil }
func (f *mutableGit) IsShallow(context.Context) (bool, error)        { return false, nil }
func (f *mutableGit) Commits(_ context.Context, path string, destination io.Writer) error {
	*f.paths = append(*f.paths, path)
	_, err := io.WriteString(destination, f.log)
	return err
}

func TestEmptyRepositoryReturnsEmptyCollections(t *testing.T) {
	service := NewService(fakeGit{repository: Repository{Name: "empty", Empty: true}})
	report, err := service.Overview(context.Background(), Filters{})
	if err != nil {
		t.Fatal(err)
	}
	if report.Totals.Commits != 0 || report.MonthlyActivity == nil || report.Contributors == nil || report.RecentCommits == nil {
		t.Fatalf("unexpected empty report: %+v", report)
	}
}
