package function

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"gitview/internal/overview"
)

type Git interface {
	Repository(context.Context) (overview.Repository, error)
	SourceFiles(context.Context, string) ([]SourceFile, error)
	FunctionHistory(context.Context, string, io.Writer) error
	IsShallow(context.Context) (bool, error)
}

type Service struct {
	git   Git
	now   func() time.Time
	mu    sync.Mutex
	cache map[string]analysis
}

type analysis struct {
	report  Report
	history map[string][]Change
}

type contribution struct {
	identity overview.ContributorIdentity
	weight   int
}

type symbol struct {
	metric       Metric
	contributors map[string]*contribution
	seenCommits  map[string]struct{}
}

func NewService(git Git) *Service {
	return &Service{git: git, now: time.Now, cache: map[string]analysis{}}
}

func (s *Service) Functions(ctx context.Context, filters overview.Filters, sortBy string, limit int) (Report, error) {
	result, err := s.analyze(ctx, filters)
	if err != nil {
		return Report{}, err
	}
	report := result.report
	sortMetrics(report.Functions, sortBy)
	if limit > 0 && len(report.Functions) > limit {
		report.Functions = report.Functions[:limit]
	}
	return report, nil
}

func (s *Service) Function(ctx context.Context, filters overview.Filters, id string) (DetailReport, error) {
	result, err := s.analyze(ctx, filters)
	if err != nil {
		return DetailReport{}, err
	}
	for _, metric := range result.report.Functions {
		if metric.ID == id {
			return DetailReport{Repository: result.report.Repository, AnalysisContext: result.report.AnalysisContext, Function: metric, History: result.history[id], Warnings: result.report.Warnings, AnalyzerVersion: AnalyzerVersion}, nil
		}
	}
	return DetailReport{}, &NotFoundError{}
}

func (s *Service) analyze(ctx context.Context, filters overview.Filters) (analysis, error) {
	repo, err := s.git.Repository(ctx)
	if err != nil {
		return analysis{}, err
	}
	key := repo.Head + "\x00" + filters.Since + "\x00" + filters.Until + "\x00" + filters.Path
	s.mu.Lock()
	if cached, ok := s.cache[key]; ok {
		s.mu.Unlock()
		return cloneAnalysis(cached), nil
	}
	if len(s.cache) > 8 {
		s.cache = map[string]analysis{}
	}
	s.mu.Unlock()
	generatedAt := s.now()
	contextValue := overview.Context{Revision: repo.Head, Timezone: timezoneLabel(generatedAt), TimeField: "author", MergePolicy: "count_commit_exclude_merge_diff", GeneratedAt: generatedAt.Format(time.RFC3339), Filters: filters}
	if repo.Empty {
		return analysis{report: Report{Repository: repo, AnalysisContext: contextValue, Functions: []Metric{}, Warnings: []overview.Warning{}, AnalyzerVersion: AnalyzerVersion}, history: map[string][]Change{}}, nil
	}
	files, err := s.git.SourceFiles(ctx, filters.Path)
	if err != nil {
		return analysis{}, fmt.Errorf("read source snapshot: %w", err)
	}
	symbols, parseFailures, vendorExcluded := parseFiles(files)
	reader, writer := io.Pipe()
	done := make(chan error, 1)
	go func() {
		commandErr := s.git.FunctionHistory(ctx, filters.Path, writer)
		_ = writer.CloseWithError(commandErr)
		done <- commandErr
	}()
	history, historyErr := attributeHistory(reader, symbols, filters)
	_ = reader.Close()
	commandErr := <-done
	if commandErr != nil {
		return analysis{}, fmt.Errorf("read function history: %w", commandErr)
	}
	if historyErr != nil {
		return analysis{}, fmt.Errorf("parse function history: %w", historyErr)
	}
	metrics := finalize(symbols)
	warnings := []overview.Warning{{Code: "function_lineage_probable", Message: "Function history is mapped from Git hunks to current Tree-sitter ranges; moves, renames, and boundary changes may be incomplete."}}
	if parseFailures > 0 {
		warnings = append(warnings, overview.Warning{Code: "source_parse_failed", Message: fmt.Sprintf("%d source file(s) contained parse errors; recoverable functions were still analyzed.", parseFailures)})
	}
	if vendorExcluded > 0 {
		warnings = append(warnings, overview.Warning{Code: "dependency_source_excluded", Message: fmt.Sprintf("%d dependency source file(s) were excluded.", vendorExcluded)})
	}
	if shallow, shallowErr := s.git.IsShallow(ctx); shallowErr == nil && shallow {
		warnings = append(warnings, overview.Warning{Code: "shallow_repository", Message: "Repository history is shallow; function history may be incomplete."})
	}
	result := analysis{report: Report{Repository: repo, AnalysisContext: contextValue, Functions: metrics, Warnings: warnings, AnalyzerVersion: AnalyzerVersion}, history: history}
	s.mu.Lock()
	s.cache[key] = result
	s.mu.Unlock()
	return cloneAnalysis(result), nil
}

var hunkPattern = regexp.MustCompile(`^@@ -([0-9]+)(?:,([0-9]+))? \+([0-9]+)(?:,([0-9]+))? @@`)

func attributeHistory(reader io.Reader, symbols map[string][]*symbol, filters overview.Filters) (map[string][]Change, error) {
	history := map[string][]Change{}
	var commit Change
	var authored time.Time
	filePath := ""
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\r")
		if strings.HasPrefix(line, "\x1e") {
			fields := strings.Split(strings.TrimPrefix(line, "\x1e"), "\x1f")
			if len(fields) != 5 {
				return nil, fmt.Errorf("invalid commit header")
			}
			var err error
			authored, err = time.Parse(time.RFC3339, fields[3])
			if err != nil {
				return nil, err
			}
			commit = Change{OID: fields[0], Author: fields[1], AuthorID: personID(fields[1], fields[2]), AuthoredAt: authored.Format(time.RFC3339), Subject: fields[4], Confidence: "probable"}
			filePath = ""
			continue
		}
		if strings.HasPrefix(line, "+++ ") {
			filePath = decodePatchPath(strings.TrimPrefix(line, "+++ "))
			continue
		}
		matches := hunkPattern.FindStringSubmatch(line)
		if len(matches) == 0 || filePath == "" || !includes(filters, authored) {
			continue
		}
		oldCount := countValue(matches[2])
		newStart := numberValue(matches[3])
		newCount := countValue(matches[4])
		for _, candidate := range symbols[filePath] {
			if !overlaps(candidate.metric.StartLine, candidate.metric.EndLine, newStart, newCount) {
				continue
			}
			candidate.metric.Additions += newCount
			candidate.metric.Deletions += oldCount
			candidate.metric.Churn += newCount + oldCount
			if _, seen := candidate.seenCommits[commit.OID]; !seen {
				candidate.metric.Changes++
				candidate.seenCommits[commit.OID] = struct{}{}
			}
			key := commit.AuthorID
			entry := candidate.contributors[key]
			if entry == nil {
				entry = &contribution{identity: overview.ContributorIdentity{ID: key, Name: commit.Author, IsBot: isBot(commit.Author)}}
				candidate.contributors[key] = entry
			}
			entry.weight += newCount + oldCount
			changes := history[candidate.metric.ID]
			if len(changes) == 0 || changes[len(changes)-1].OID != commit.OID {
				changes = append(changes, commit)
			}
			changes[len(changes)-1].Additions += newCount
			changes[len(changes)-1].Deletions += oldCount
			changes[len(changes)-1].Churn += newCount + oldCount
			history[candidate.metric.ID] = changes
		}
	}
	return history, scanner.Err()
}

func finalize(symbols map[string][]*symbol) []Metric {
	metrics := []Metric{}
	maxChanges, maxChurn := 0, 0
	for _, fileSymbols := range symbols {
		for _, item := range fileSymbols {
			var owner *contribution
			total := 0
			for _, value := range item.contributors {
				total += value.weight
				if owner == nil || value.weight > owner.weight {
					owner = value
				}
			}
			if owner != nil {
				item.metric.Owner = owner.identity
				item.metric.OwnerShare = float64(owner.weight) / float64(total)
			}
			maxChanges = max(maxChanges, item.metric.Changes)
			maxChurn = max(maxChurn, item.metric.Churn)
			metrics = append(metrics, item.metric)
		}
	}
	for index := range metrics {
		metrics[index].HotspotScore = math.Sqrt(ratio(metrics[index].Changes, maxChanges)*ratio(metrics[index].Churn, maxChurn)) * 100
	}
	return metrics
}

func sortMetrics(metrics []Metric, sortBy string) {
	sort.Slice(metrics, func(i, j int) bool {
		switch sortBy {
		case "complexity":
			if metrics[i].Complexity != metrics[j].Complexity {
				return metrics[i].Complexity > metrics[j].Complexity
			}
		case "churn":
			if metrics[i].Churn != metrics[j].Churn {
				return metrics[i].Churn > metrics[j].Churn
			}
		case "changes":
			if metrics[i].Changes != metrics[j].Changes {
				return metrics[i].Changes > metrics[j].Changes
			}
		default:
			if metrics[i].HotspotScore != metrics[j].HotspotScore {
				return metrics[i].HotspotScore > metrics[j].HotspotScore
			}
		}
		if metrics[i].Path != metrics[j].Path {
			return metrics[i].Path < metrics[j].Path
		}
		return metrics[i].QualifiedName < metrics[j].QualifiedName
	})
}
func symbolID(path, name, signature string) string {
	sum := sha256.Sum256([]byte(path + "\x00" + name + "\x00" + signature))
	return hex.EncodeToString(sum[:12])
}
func personID(name, email string) string {
	identity := strings.ToLower(strings.TrimSpace(email))
	if identity == "" {
		identity = strings.ToLower(strings.TrimSpace(name))
	}
	sum := sha256.Sum256([]byte(identity))
	return hex.EncodeToString(sum[:12])
}
func isBot(name string) bool {
	lower := strings.ToLower(name)
	return strings.Contains(lower, "[bot]") || strings.HasSuffix(lower, " bot")
}
func countValue(raw string) int {
	if raw == "" {
		return 1
	}
	return numberValue(raw)
}
func numberValue(raw string) int { value, _ := strconv.Atoi(raw); return value }
func decodePatchPath(raw string) string {
	if raw == "/dev/null" {
		return ""
	}
	if strings.HasPrefix(raw, "\"") {
		if decoded, err := strconv.Unquote(raw); err == nil {
			return decoded
		}
	}
	return raw
}
func overlaps(start, end, changedStart, changedCount int) bool {
	if changedCount == 0 {
		return changedStart >= start && changedStart <= end+1
	}
	changedEnd := changedStart + changedCount - 1
	return changedStart <= end && changedEnd >= start
}
func includes(filters overview.Filters, authored time.Time) bool {
	if filters.Since != "" {
		since, _ := time.ParseInLocation("2006-01-02", filters.Since, time.Local)
		if authored.Before(since) {
			return false
		}
	}
	if filters.Until != "" {
		until, _ := time.ParseInLocation("2006-01-02", filters.Until, time.Local)
		if !authored.Before(until.AddDate(0, 0, 1)) {
			return false
		}
	}
	return true
}
func ratio(value, total int) float64 {
	if total == 0 {
		return 0
	}
	return float64(value) / float64(total)
}
func cloneAnalysis(source analysis) analysis {
	result := source
	result.report.Functions = append([]Metric{}, source.report.Functions...)
	result.report.Warnings = append([]overview.Warning{}, source.report.Warnings...)
	result.history = map[string][]Change{}
	for key, values := range source.history {
		result.history[key] = append([]Change{}, values...)
	}
	return result
}

func timezoneLabel(at time.Time) string {
	if name := time.Local.String(); name != "" && name != "Local" {
		return name
	}
	_, offset := at.In(time.Local).Zone()
	sign := "+"
	if offset < 0 {
		sign = "-"
		offset = -offset
	}
	return fmt.Sprintf("UTC%s%02d:%02d", sign, offset/3600, offset%3600/60)
}
