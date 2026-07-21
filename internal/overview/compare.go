package overview

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"
)

type revisionGit interface {
	ResolveRevision(context.Context, string) (string, error)
	CommitsBetween(context.Context, string, string, string, io.Writer) error
}

func (s *Service) Compare(ctx context.Context, filters Filters, fromRef, toRef string) (CompareReport, error) {
	fromRef = strings.TrimSpace(fromRef)
	toRef = strings.TrimSpace(toRef)
	if fromRef == "" || toRef == "" {
		return CompareReport{}, &FilterError{Code: "invalid_comparison", Message: "from and to revisions are required"}
	}
	revisions, ok := s.git.(revisionGit)
	if !ok {
		return CompareReport{}, fmt.Errorf("revision comparison is unavailable")
	}
	repo, err := s.git.Repository(ctx)
	if err != nil {
		return CompareReport{}, err
	}
	fromOID, err := revisions.ResolveRevision(ctx, fromRef)
	if err != nil {
		return CompareReport{}, &FilterError{Code: "invalid_from_revision", Message: "from revision cannot be resolved"}
	}
	toOID, err := revisions.ResolveRevision(ctx, toRef)
	if err != nil {
		return CompareReport{}, &FilterError{Code: "invalid_to_revision", Message: "to revision cannot be resolved"}
	}
	reader, writer := io.Pipe()
	done := make(chan error, 1)
	go func() {
		commandErr := revisions.CommitsBetween(ctx, fromOID, toOID, filters.Path, writer)
		_ = writer.CloseWithError(commandErr)
		done <- commandErr
	}()
	facts, parseErr := parseLog(reader)
	_ = reader.Close()
	commandErr := <-done
	if commandErr != nil {
		return CompareReport{}, fmt.Errorf("read comparison history: %w", commandErr)
	}
	if parseErr != nil {
		return CompareReport{}, fmt.Errorf("parse comparison history: %w", parseErr)
	}
	selected := make([]commitFact, 0, len(facts))
	for _, fact := range facts {
		if filters.includes(fact.Authored) {
			selected = append(selected, fact)
		}
	}
	base := s.emptyReport(repo, filters)
	base.AnalysisContext.Revision = toOID
	base.aggregate(selected)
	s.appendShallowWarning(ctx, &base)
	files, _ := buildFileMetrics(selected, s.now(), ownershipRecentDays)
	sortFileMetrics(files, "hotspot")
	filesTotal := len(files)
	filesLimit := 20
	if len(files) > 20 {
		files = files[:20]
	}
	return CompareReport{Repository: repo, AnalysisContext: base.AnalysisContext, FromRef: fromRef, ToRef: toRef, FromRevision: fromOID, ToRevision: toOID, Totals: base.Totals, Contributors: base.Contributors, Files: files, FilesTotal: filesTotal, FilesLimit: filesLimit, FilesHasMore: len(files) < filesTotal, Commits: base.RecentCommits, Warnings: base.Warnings}, nil
}

func (s *Service) Explain(ctx context.Context, path, month string, location *time.Location) (ExplainReport, error) {
	if location == nil {
		location = time.Local
	}
	start, err := time.ParseInLocation("2006-01", month, location)
	if err != nil || start.Format("2006-01") != month {
		return ExplainReport{}, &FilterError{Code: "invalid_month", Message: "month must use YYYY-MM"}
	}
	end := start.AddDate(0, 1, -1)
	filters, err := ParseFilters(start.Format("2006-01-02"), end.Format("2006-01-02"), path, location)
	if err != nil {
		return ExplainReport{}, err
	}
	report, err := s.Overview(ctx, filters)
	if err != nil {
		return ExplainReport{}, err
	}
	_, facts, err := s.filteredFacts(ctx, filters)
	if err != nil {
		return ExplainReport{}, err
	}
	paths := aggregatePaths(facts)
	if len(paths) > 10 {
		paths = paths[:10]
	}
	contributors := report.Contributors
	if len(contributors) > 10 {
		contributors = contributors[:10]
	}
	commits := report.RecentCommits
	if len(commits) > 10 {
		commits = commits[:10]
	}
	insights := buildInsights(report.Totals, contributors, paths, commits)
	return ExplainReport{Repository: report.Repository, AnalysisContext: report.AnalysisContext, Month: month, Totals: report.Totals, Contributors: contributors, Paths: paths, Commits: commits, Insights: insights, Warnings: report.Warnings}, nil
}

func buildInsights(totals Totals, contributors []Contributor, paths []PathContribution, commits []Commit) []Insight {
	insights := []Insight{{Kind: "summary", Values: map[string]any{"commits": totals.Commits, "contributors": totals.Contributors, "churn": totals.Churn}}}
	if len(contributors) > 0 {
		insights = append(insights, Insight{Kind: "contributor", Values: map[string]any{"name": contributors[0].Name, "commits": contributors[0].Commits, "churn": contributors[0].Churn}})
	}
	if len(paths) > 0 {
		insights = append(insights, Insight{Kind: "path", Values: map[string]any{"path": paths[0].Path, "churn": paths[0].Churn, "commits": paths[0].Commits}})
	}
	if len(commits) > 0 {
		largest := commits[0]
		for _, commit := range commits[1:] {
			if commit.Churn > largest.Churn {
				largest = commit
			}
		}
		insights = append(insights, Insight{Kind: "commit", Values: map[string]any{"subject": largest.Subject, "churn": largest.Churn, "oid": largest.OID[:min(8, len(largest.OID))]}})
	}
	return insights
}
