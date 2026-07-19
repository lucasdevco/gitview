package overview

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Git interface {
	Repository(context.Context) (Repository, error)
	Commits(context.Context) ([]byte, error)
	IsShallow(context.Context) (bool, error)
}

type Service struct {
	git Git
	now func() time.Time

	mu         sync.Mutex
	cachedHead string
	cached     Report
}

func NewService(git Git) *Service {
	return &Service{git: git, now: time.Now}
}

func (s *Service) Overview(ctx context.Context) (Report, error) {
	repo, err := s.git.Repository(ctx)
	if err != nil {
		return Report{}, err
	}

	s.mu.Lock()
	if repo.Head != "" && repo.Head == s.cachedHead {
		report := s.cached
		s.mu.Unlock()
		return report, nil
	}
	s.mu.Unlock()

	generatedAt := s.now()
	report := Report{
		Repository: repo,
		AnalysisContext: Context{
			Revision:    repo.Head,
			Timezone:    localTimezoneLabel(generatedAt),
			TimeField:   "author",
			MergePolicy: "count_commit_exclude_merge_diff",
			GeneratedAt: generatedAt.Format(time.RFC3339),
		},
		MonthlyActivity: []Month{},
		Contributors:    []Contributor{},
		RecentCommits:   []Commit{},
		Warnings:        []Warning{},
	}
	if repo.Empty {
		return report, nil
	}

	raw, err := s.git.Commits(ctx)
	if err != nil {
		return Report{}, fmt.Errorf("read git history: %w", err)
	}
	facts, err := parseLog(raw)
	if err != nil {
		return Report{}, fmt.Errorf("parse git history: %w", err)
	}
	report.aggregate(facts)

	shallow, err := s.git.IsShallow(ctx)
	if err == nil && shallow {
		report.Warnings = append(report.Warnings, Warning{
			Code:    "shallow_repository",
			Message: "Repository history is shallow; totals may be incomplete.",
		})
	}

	s.mu.Lock()
	s.cachedHead = repo.Head
	s.cached = report
	s.mu.Unlock()
	return report, nil
}

func localTimezoneLabel(at time.Time) string {
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

func parseLog(raw []byte) ([]commitFact, error) {
	records := strings.Split(string(raw), "\x1e")
	facts := make([]commitFact, 0, len(records))
	for _, record := range records {
		record = strings.Trim(record, "\r\n")
		if record == "" {
			continue
		}
		lines := strings.Split(record, "\n")
		fields := strings.Split(strings.TrimSuffix(lines[0], "\r"), "\x1f")
		if len(fields) != 5 {
			return nil, fmt.Errorf("invalid commit header with %d fields", len(fields))
		}
		authored, err := time.Parse(time.RFC3339, fields[3])
		if err != nil {
			return nil, fmt.Errorf("commit %s author time: %w", fields[0], err)
		}
		fact := commitFact{OID: fields[0], Name: fields[1], Email: strings.ToLower(fields[2]), Authored: authored, Subject: fields[4]}
		for _, line := range lines[1:] {
			parts := strings.SplitN(strings.TrimSuffix(line, "\r"), "\t", 3)
			if len(parts) < 3 || parts[0] == "-" || parts[1] == "-" {
				continue
			}
			additions, addErr := strconv.Atoi(parts[0])
			deletions, delErr := strconv.Atoi(parts[1])
			if addErr != nil || delErr != nil {
				return nil, fmt.Errorf("commit %s invalid numstat %q", fact.OID, line)
			}
			fact.Additions += additions
			fact.Deletions += deletions
		}
		facts = append(facts, fact)
	}
	return facts, nil
}

func (r *Report) aggregate(facts []commitFact) {
	months := map[string]*Month{}
	contributors := map[string]*Contributor{}
	for index, fact := range facts {
		churn := fact.Additions + fact.Deletions
		r.Totals.Commits++
		r.Totals.Additions += fact.Additions
		r.Totals.Deletions += fact.Deletions
		r.Totals.Churn += churn

		monthKey := fact.Authored.In(time.Local).Format("2006-01")
		month := months[monthKey]
		if month == nil {
			month = &Month{Month: monthKey}
			months[monthKey] = month
		}
		month.Commits++
		month.Additions += fact.Additions
		month.Deletions += fact.Deletions
		month.Churn += churn

		key := fact.Email
		if key == "" {
			key = strings.ToLower(fact.Name)
		}
		person := contributors[key]
		if person == nil {
			person = &Contributor{Name: fact.Name, LastActive: fact.Authored.Format(time.RFC3339)}
			contributors[key] = person
		}
		person.Commits++
		person.Additions += fact.Additions
		person.Deletions += fact.Deletions
		person.Churn += churn
		if fact.Authored.Format(time.RFC3339) > person.LastActive {
			person.LastActive = fact.Authored.Format(time.RFC3339)
		}

		if index < 50 {
			r.RecentCommits = append(r.RecentCommits, Commit{
				OID: fact.OID, Subject: fact.Subject, Author: fact.Name,
				AuthoredAt: fact.Authored.Format(time.RFC3339), Additions: fact.Additions,
				Deletions: fact.Deletions, Churn: churn,
			})
		}
	}

	for _, month := range months {
		r.MonthlyActivity = append(r.MonthlyActivity, *month)
	}
	sort.Slice(r.MonthlyActivity, func(i, j int) bool { return r.MonthlyActivity[i].Month < r.MonthlyActivity[j].Month })
	for _, contributor := range contributors {
		r.Contributors = append(r.Contributors, *contributor)
	}
	sort.Slice(r.Contributors, func(i, j int) bool {
		if r.Contributors[i].Commits == r.Contributors[j].Commits {
			return strings.ToLower(r.Contributors[i].Name) < strings.ToLower(r.Contributors[j].Name)
		}
		return r.Contributors[i].Commits > r.Contributors[j].Commits
	})
	r.Totals.Contributors = len(r.Contributors)
}
