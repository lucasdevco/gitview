package overview

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Git interface {
	Repository(context.Context) (Repository, error)
	Commits(context.Context, string, io.Writer) error
	IsShallow(context.Context) (bool, error)
}

type directoryGit interface {
	Directories(context.Context, string) ([]string, error)
}

type branchGit interface {
	Branches(context.Context) ([]BranchRef, error)
	BranchCommits(context.Context, string, int) ([]BranchCommit, error)
	WorkingTree(context.Context) (WorkingTree, error)
}

type Service struct {
	git Git
	now func() time.Time

	mu         sync.Mutex
	cachedHead string
	cache      map[string]Report
	factCache  map[string][]commitFact
	factOrder  []string
}

func NewService(git Git) *Service {
	return &Service{git: git, now: time.Now, cache: map[string]Report{}, factCache: map[string][]commitFact{}}
}

func (s *Service) Directories(ctx context.Context, parent string) ([]string, error) {
	repo, err := s.git.Repository(ctx)
	if err != nil {
		return nil, err
	}
	if repo.Empty {
		return []string{}, nil
	}
	git, ok := s.git.(directoryGit)
	if !ok {
		return nil, fmt.Errorf("repository directory listing is unavailable")
	}
	return git.Directories(ctx, parent)
}

func (s *Service) Branches(ctx context.Context, selected string, limit int) (BranchReport, error) {
	repo, err := s.git.Repository(ctx)
	if err != nil {
		return BranchReport{}, err
	}
	if repo.Empty {
		return BranchReport{Repository: repo, Branches: []BranchRef{}, Commits: []BranchCommit{}}, nil
	}
	git, ok := s.git.(branchGit)
	if !ok {
		return BranchReport{}, fmt.Errorf("branch history is unavailable")
	}
	branches, err := git.Branches(ctx)
	if err != nil {
		return BranchReport{}, err
	}
	revision := ""
	if selected != "" {
		for _, branch := range branches {
			if branch.Name == selected {
				revision = branch.FullName
				break
			}
		}
		if revision == "" {
			return BranchReport{}, &NotFoundError{Entity: "branch"}
		}
	}
	commits, err := git.BranchCommits(ctx, revision, limit)
	if err != nil {
		return BranchReport{}, err
	}
	refsByOID := map[string][]string{}
	for _, branch := range branches {
		refsByOID[branch.OID] = append(refsByOID[branch.OID], branch.Name)
	}
	for index := range commits {
		commits[index].Refs = refsByOID[commits[index].OID]
		if commits[index].Refs == nil {
			commits[index].Refs = []string{}
		}
	}
	workingTree, err := git.WorkingTree(ctx)
	if err != nil {
		return BranchReport{}, err
	}
	return BranchReport{Repository: repo, Branches: branches, Commits: commits, WorkingTree: workingTree}, nil
}

func (s *Service) Overview(ctx context.Context, filters Filters) (Report, error) {
	repo, err := s.git.Repository(ctx)
	if err != nil {
		return Report{}, err
	}

	s.mu.Lock()
	if repo.Head != s.cachedHead {
		s.cachedHead = repo.Head
		s.cache = map[string]Report{}
		s.factCache = map[string][]commitFact{}
		s.factOrder = nil
	}
	cacheKey := filters.cacheKey()
	if repo.Head != "" {
		report, ok := s.cache[cacheKey]
		if ok {
			s.mu.Unlock()
			return report, nil
		}
	}
	if repo.Empty {
		s.mu.Unlock()
		return s.emptyReport(repo, filters), nil
	}
	s.mu.Unlock()

	report := s.emptyReport(repo, filters)

	facts, err := s.loadFacts(ctx, repo.Head, filters.Path)
	if err != nil {
		return Report{}, err
	}
	filtered := make([]commitFact, 0, len(facts))
	for _, fact := range facts {
		if filters.includes(fact.Authored) {
			filtered = append(filtered, fact)
		}
	}
	report.aggregate(filtered)

	s.appendShallowWarning(ctx, &report)

	s.mu.Lock()
	if repo.Head == s.cachedHead {
		s.cache[cacheKey] = report
	}
	s.mu.Unlock()
	return report, nil
}

func (s *Service) Contributor(ctx context.Context, filters Filters, id string) (ContributorReport, error) {
	repo, err := s.git.Repository(ctx)
	if err != nil {
		return ContributorReport{}, err
	}
	if repo.Empty {
		return ContributorReport{}, &NotFoundError{Entity: "contributor"}
	}

	s.mu.Lock()
	if repo.Head != s.cachedHead {
		s.cachedHead = repo.Head
		s.cache = map[string]Report{}
		s.factCache = map[string][]commitFact{}
		s.factOrder = nil
	}
	s.mu.Unlock()

	facts, err := s.loadFacts(ctx, repo.Head, filters.Path)
	if err != nil {
		return ContributorReport{}, err
	}
	selected := make([]commitFact, 0)
	for _, fact := range facts {
		if filters.includes(fact.Authored) && personID(identityKey(fact)) == id {
			selected = append(selected, fact)
		}
	}
	if len(selected) == 0 {
		return ContributorReport{}, &NotFoundError{Entity: "contributor"}
	}

	base := s.emptyReport(repo, filters)
	base.aggregate(selected)
	paths := aggregatePaths(selected)
	if len(paths) > 20 {
		paths = paths[:20]
	}
	s.appendShallowWarning(ctx, &base)
	return ContributorReport{
		Repository:      repo,
		AnalysisContext: base.AnalysisContext,
		Contributor:     base.Contributors[0],
		MonthlyActivity: base.MonthlyActivity,
		TopPaths:        paths,
		RecentCommits:   base.RecentCommits,
		Warnings:        base.Warnings,
	}, nil
}

func (s *Service) appendShallowWarning(ctx context.Context, report *Report) {
	shallow, err := s.git.IsShallow(ctx)
	if err == nil && shallow {
		report.Warnings = append(report.Warnings, Warning{Code: "shallow_repository", Message: "Repository history is shallow; totals may be incomplete."})
	}
}

func aggregatePaths(facts []commitFact) []PathContribution {
	byPath := map[string]*PathContribution{}
	for _, fact := range facts {
		seen := map[string]struct{}{}
		for _, file := range fact.Files {
			path := file.Path
			entry := byPath[path]
			if entry == nil {
				entry = &PathContribution{Path: path}
				byPath[path] = entry
			}
			entry.Additions += file.Additions
			entry.Deletions += file.Deletions
			entry.Churn += file.Additions + file.Deletions
			if _, ok := seen[path]; !ok {
				entry.Commits++
				seen[path] = struct{}{}
			}
		}
	}
	paths := make([]PathContribution, 0, len(byPath))
	for _, entry := range byPath {
		paths = append(paths, *entry)
	}
	sort.Slice(paths, func(i, j int) bool {
		if paths[i].Churn == paths[j].Churn {
			return paths[i].Path < paths[j].Path
		}
		return paths[i].Churn > paths[j].Churn
	})
	return paths
}

func (s *Service) loadFacts(ctx context.Context, head, path string) ([]commitFact, error) {
	s.mu.Lock()
	if facts, ok := s.factCache[path]; ok && head == s.cachedHead {
		s.mu.Unlock()
		return facts, nil
	}
	s.mu.Unlock()

	facts, err := s.readCommits(ctx, path)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if head != s.cachedHead {
		return facts, nil
	}
	if _, exists := s.factCache[path]; !exists {
		s.factOrder = append(s.factOrder, path)
	}
	s.factCache[path] = facts
	for len(s.factOrder) > 8 {
		oldest := s.factOrder[0]
		s.factOrder = s.factOrder[1:]
		delete(s.factCache, oldest)
	}
	return facts, nil
}

func (s *Service) readCommits(ctx context.Context, path string) ([]commitFact, error) {
	reader, writer := io.Pipe()
	done := make(chan error, 1)
	go func() {
		err := s.git.Commits(ctx, path, writer)
		_ = writer.CloseWithError(err)
		done <- err
	}()

	facts, parseErr := parseLog(reader)
	_ = reader.Close()
	commandErr := <-done
	if commandErr != nil {
		return nil, fmt.Errorf("read git history: %w", commandErr)
	}
	if parseErr != nil {
		return nil, fmt.Errorf("parse git history: %w", parseErr)
	}
	return facts, nil
}

func (s *Service) emptyReport(repo Repository, filters Filters) Report {
	generatedAt := s.now()
	return Report{
		Repository: repo,
		AnalysisContext: Context{
			Revision:    repo.Head,
			Timezone:    localTimezoneLabel(generatedAt),
			TimeField:   "author",
			MergePolicy: "count_commit_exclude_merge_diff",
			GeneratedAt: generatedAt.Format(time.RFC3339),
			Filters:     filters,
		},
		MonthlyActivity: []Month{},
		Contributors:    []Contributor{},
		RecentCommits:   []Commit{},
		Warnings:        []Warning{},
	}
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

func parseLog(reader io.Reader) ([]commitFact, error) {
	facts := []commitFact{}
	var current *commitFact
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\r")
		if strings.HasPrefix(line, "\x1e") {
			if current != nil {
				facts = append(facts, *current)
			}
			fields := strings.Split(strings.TrimPrefix(line, "\x1e"), "\x1f")
			if len(fields) != 5 {
				return nil, fmt.Errorf("invalid commit header with %d fields", len(fields))
			}
			authored, err := time.Parse(time.RFC3339, fields[3])
			if err != nil {
				return nil, fmt.Errorf("commit %s author time: %w", fields[0], err)
			}
			current = &commitFact{OID: fields[0], Name: fields[1], Email: strings.ToLower(fields[2]), Authored: authored, Subject: fields[4]}
			continue
		}
		if current == nil {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) < 3 {
			continue
		}
		if parts[0] == "-" || parts[1] == "-" {
			current.Binary++
			current.Files = append(current.Files, fileFact{Path: parseGitPath(parts[2]), Binary: true})
			continue
		}
		additions, addErr := strconv.Atoi(parts[0])
		deletions, delErr := strconv.Atoi(parts[1])
		if addErr != nil || delErr != nil {
			return nil, fmt.Errorf("commit %s invalid numstat %q", current.OID, line)
		}
		current.Additions += additions
		current.Deletions += deletions
		current.Files = append(current.Files, fileFact{Path: parseGitPath(parts[2]), Additions: additions, Deletions: deletions})
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if current != nil {
		facts = append(facts, *current)
	}
	return facts, nil
}

func (r *Report) aggregate(facts []commitFact) {
	months := map[string]*Month{}
	monthlyContributors := map[string]map[string]*ContributorActivity{}
	contributors := map[string]*Contributor{}
	nameIdentities := map[string]map[string]struct{}{}
	binaryFiles := 0
	for index, fact := range facts {
		churn := fact.Additions + fact.Deletions
		r.Totals.Commits++
		r.Totals.Additions += fact.Additions
		r.Totals.Deletions += fact.Deletions
		r.Totals.Churn += churn
		binaryFiles += fact.Binary

		monthKey := fact.Authored.In(time.Local).Format("2006-01")
		month := months[monthKey]
		if month == nil {
			month = &Month{Month: monthKey, Contributors: []ContributorActivity{}}
			months[monthKey] = month
			monthlyContributors[monthKey] = map[string]*ContributorActivity{}
		}
		month.Commits++
		month.Additions += fact.Additions
		month.Deletions += fact.Deletions
		month.Churn += churn

		key := identityKey(fact)
		id := personID(key)
		monthlyPerson := monthlyContributors[monthKey][key]
		if monthlyPerson == nil {
			monthlyPerson = &ContributorActivity{ID: id, Name: fact.Name, IsBot: isBot(fact.Name, fact.Email)}
			monthlyContributors[monthKey][key] = monthlyPerson
		}
		monthlyPerson.Commits++
		monthlyPerson.Additions += fact.Additions
		monthlyPerson.Deletions += fact.Deletions
		monthlyPerson.Churn += churn

		person := contributors[key]
		if person == nil {
			person = &Contributor{ID: id, Name: fact.Name, IsBot: isBot(fact.Name, fact.Email), LastActive: fact.Authored.Format(time.RFC3339)}
			contributors[key] = person
		}
		nameKey := strings.ToLower(strings.TrimSpace(fact.Name))
		if nameIdentities[nameKey] == nil {
			nameIdentities[nameKey] = map[string]struct{}{}
		}
		nameIdentities[nameKey][key] = struct{}{}
		person.Commits++
		person.Additions += fact.Additions
		person.Deletions += fact.Deletions
		person.Churn += churn
		if fact.Authored.Format(time.RFC3339) > person.LastActive {
			person.LastActive = fact.Authored.Format(time.RFC3339)
		}

		if index < 50 {
			r.RecentCommits = append(r.RecentCommits, Commit{
				OID: fact.OID, Subject: fact.Subject, Author: fact.Name, AuthorID: personID(key),
				AuthoredAt: fact.Authored.Format(time.RFC3339), Additions: fact.Additions,
				Deletions: fact.Deletions, Churn: churn,
			})
		}
	}

	for _, month := range months {
		for _, contributor := range monthlyContributors[month.Month] {
			month.Contributors = append(month.Contributors, *contributor)
		}
		sort.Slice(month.Contributors, func(i, j int) bool {
			if month.Contributors[i].Commits == month.Contributors[j].Commits {
				return strings.ToLower(month.Contributors[i].Name) < strings.ToLower(month.Contributors[j].Name)
			}
			return month.Contributors[i].Commits > month.Contributors[j].Commits
		})
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
	duplicateNames := 0
	for _, identities := range nameIdentities {
		if len(identities) > 1 {
			duplicateNames++
		}
	}
	if duplicateNames > 0 {
		r.Warnings = append(r.Warnings, Warning{Code: "possible_duplicate_identity", Message: fmt.Sprintf("%d contributor name(s) use multiple canonical emails; totals may split the same person.", duplicateNames)})
	}
	if binaryFiles > 0 {
		r.Warnings = append(r.Warnings, Warning{Code: "binary_files_excluded", Message: fmt.Sprintf("%d binary file change(s) were excluded from line totals.", binaryFiles)})
	}
}

func identityKey(fact commitFact) string {
	if fact.Email != "" {
		return strings.ToLower(fact.Email)
	}
	return strings.ToLower(strings.TrimSpace(fact.Name))
}

func personID(identity string) string {
	digest := sha256.Sum256([]byte(identity))
	return hex.EncodeToString(digest[:12])
}

func parseGitPath(value string) string {
	if strings.HasPrefix(value, `"`) {
		if decoded, err := strconv.Unquote(value); err == nil {
			return decoded
		}
	}
	return value
}

func isBot(name, email string) bool {
	identity := strings.ToLower(name + " " + email)
	return strings.Contains(identity, "[bot]") || strings.Contains(identity, "dependabot") || strings.Contains(identity, "renovate")
}
