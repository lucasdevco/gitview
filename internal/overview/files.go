package overview

import (
	"context"
	"math"
	"sort"
	"time"
)

const ownershipRecentDays = 180

type identityContribution struct {
	Identity   ContributorIdentity
	Commits    int
	Churn      int
	Weight     int
	LastActive time.Time
}

type fileAccumulator struct {
	Metric       FileMetric
	Identities   map[string]*identityContribution
	Recent       map[string]*identityContribution
	TotalWeight  int
	RecentWeight int
}

func (s *Service) Files(ctx context.Context, filters Filters, sortBy string, limit int) (FileReport, error) {
	repo, facts, err := s.filteredFacts(ctx, filters)
	if err != nil {
		return FileReport{}, err
	}
	base := s.emptyReport(repo, filters)
	base.aggregate(facts)
	s.appendShallowWarning(ctx, &base)
	metrics, _ := buildFileMetrics(facts, s.now(), ownershipRecentDays)
	sortFileMetrics(metrics, sortBy)
	if limit > 0 && len(metrics) > limit {
		metrics = metrics[:limit]
	}
	return FileReport{Repository: repo, AnalysisContext: base.AnalysisContext, Files: metrics, Warnings: base.Warnings, RecentDays: ownershipRecentDays}, nil
}

func (s *Service) File(ctx context.Context, filters Filters, filePath string) (FileDetailReport, error) {
	repo, facts, err := s.filteredFacts(ctx, filters)
	if err != nil {
		return FileDetailReport{}, err
	}
	base := s.emptyReport(repo, filters)
	base.aggregate(facts)
	s.appendShallowWarning(ctx, &base)
	metrics, accumulators := buildFileMetrics(facts, s.now(), ownershipRecentDays)
	var metric *FileMetric
	for index := range metrics {
		if metrics[index].Path == filePath {
			metric = &metrics[index]
			break
		}
	}
	if metric == nil {
		return FileDetailReport{}, &NotFoundError{Entity: "file"}
	}
	accumulator := accumulators[filePath]
	contributors := make([]FileContributor, 0, len(accumulator.Identities))
	for _, identity := range accumulator.Identities {
		contributors = append(contributors, FileContributor{
			Contributor: identity.Identity,
			Commits:     identity.Commits,
			Churn:       identity.Churn,
			Share:       share(identity.Weight, accumulator.TotalWeight),
			LastActive:  identity.LastActive.Format(time.RFC3339),
		})
	}
	sort.Slice(contributors, func(i, j int) bool {
		if contributors[i].Churn == contributors[j].Churn {
			return contributors[i].Contributor.Name < contributors[j].Contributor.Name
		}
		return contributors[i].Churn > contributors[j].Churn
	})
	commits := fileCommits(facts, filePath)
	return FileDetailReport{
		Repository: repo, AnalysisContext: base.AnalysisContext, File: *metric,
		Contributors: contributors, RecentCommits: commits, Warnings: base.Warnings, RecentDays: ownershipRecentDays,
	}, nil
}

func (s *Service) filteredFacts(ctx context.Context, filters Filters) (Repository, []commitFact, error) {
	repo, err := s.git.Repository(ctx)
	if err != nil {
		return Repository{}, nil, err
	}
	if repo.Empty {
		return repo, []commitFact{}, nil
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
		return Repository{}, nil, err
	}
	filtered := make([]commitFact, 0, len(facts))
	for _, fact := range facts {
		if filters.includes(fact.Authored) {
			filtered = append(filtered, fact)
		}
	}
	return repo, filtered, nil
}

func buildFileMetrics(facts []commitFact, now time.Time, recentDays int) ([]FileMetric, map[string]*fileAccumulator) {
	cutoff := now.AddDate(0, 0, -recentDays)
	files := map[string]*fileAccumulator{}
	for _, fact := range facts {
		key := identityKey(fact)
		identity := ContributorIdentity{ID: personID(key), Name: fact.Name, IsBot: isBot(fact.Name, fact.Email)}
		for _, file := range fact.Files {
			entry := files[file.Path]
			if entry == nil {
				entry = &fileAccumulator{Metric: FileMetric{Path: file.Path}, Identities: map[string]*identityContribution{}, Recent: map[string]*identityContribution{}}
				files[file.Path] = entry
			}
			entry.Metric.Commits++
			entry.Metric.Additions += file.Additions
			entry.Metric.Deletions += file.Deletions
			entry.Metric.Churn += file.Additions + file.Deletions
			if entry.Metric.LastChanged == "" || fact.Authored.Format(time.RFC3339) > entry.Metric.LastChanged {
				entry.Metric.LastChanged = fact.Authored.Format(time.RFC3339)
				entry.Metric.LastContributor = identity
			}
			weight := file.Additions + file.Deletions
			if weight == 0 {
				weight = 1
			}
			churn := file.Additions + file.Deletions
			addIdentityContribution(entry.Identities, key, identity, fact.Authored, churn, weight)
			entry.TotalWeight += weight
			if !fact.Authored.Before(cutoff) {
				addIdentityContribution(entry.Recent, key, identity, fact.Authored, churn, weight)
				entry.RecentWeight += weight
			}
		}
	}
	metrics := make([]FileMetric, 0, len(files))
	maxCommits, maxChurn := 0, 0
	for _, entry := range files {
		entry.Metric.Contributors = len(entry.Identities)
		entry.Metric.HistoricalOwner, entry.Metric.HistoricalShare = leadingOwner(entry.Identities, entry.TotalWeight)
		entry.Metric.RecentOwner, entry.Metric.RecentShare = leadingOwner(entry.Recent, entry.RecentWeight)
		entry.Metric.BusFactor80 = busFactor(entry.Identities, entry.TotalWeight, 0.8)
		entry.Metric.OwnershipRisk = math.Max(entry.Metric.HistoricalShare, entry.Metric.RecentShare) * 100
		maxCommits = max(maxCommits, entry.Metric.Commits)
		maxChurn = max(maxChurn, entry.Metric.Churn)
		metrics = append(metrics, entry.Metric)
	}
	for index := range metrics {
		frequency := share(metrics[index].Commits, maxCommits)
		churn := share(metrics[index].Churn, maxChurn)
		metrics[index].HotspotScore = math.Sqrt(frequency*churn) * 100
	}
	return metrics, files
}

func addIdentityContribution(target map[string]*identityContribution, key string, identity ContributorIdentity, authored time.Time, churn, weight int) {
	entry := target[key]
	if entry == nil {
		entry = &identityContribution{Identity: identity}
		target[key] = entry
	}
	entry.Commits++
	entry.Churn += churn
	entry.Weight += weight
	if authored.After(entry.LastActive) {
		entry.LastActive = authored
	}
}

func leadingOwner(contributions map[string]*identityContribution, total int) (ContributorIdentity, float64) {
	var owner *identityContribution
	for _, contribution := range contributions {
		if owner == nil || contribution.Weight > owner.Weight {
			owner = contribution
		}
	}
	if owner == nil {
		return ContributorIdentity{}, 0
	}
	return owner.Identity, share(owner.Weight, total)
}

func busFactor(contributions map[string]*identityContribution, total int, threshold float64) int {
	if total == 0 {
		return 0
	}
	weights := make([]int, 0, len(contributions))
	for _, contribution := range contributions {
		weights = append(weights, contribution.Weight)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(weights)))
	covered := 0
	for index, weight := range weights {
		covered += weight
		if float64(covered)/float64(total) >= threshold {
			return index + 1
		}
	}
	return len(weights)
}

func sortFileMetrics(metrics []FileMetric, sortBy string) {
	sort.Slice(metrics, func(i, j int) bool {
		switch sortBy {
		case "ownership":
			if metrics[i].OwnershipRisk != metrics[j].OwnershipRisk {
				return metrics[i].OwnershipRisk > metrics[j].OwnershipRisk
			}
		case "commits":
			if metrics[i].Commits != metrics[j].Commits {
				return metrics[i].Commits > metrics[j].Commits
			}
		case "churn":
			if metrics[i].Churn != metrics[j].Churn {
				return metrics[i].Churn > metrics[j].Churn
			}
		default:
			if metrics[i].HotspotScore != metrics[j].HotspotScore {
				return metrics[i].HotspotScore > metrics[j].HotspotScore
			}
		}
		return metrics[i].Path < metrics[j].Path
	})
}

func fileCommits(facts []commitFact, filePath string) []Commit {
	commits := []Commit{}
	for _, fact := range facts {
		for _, file := range fact.Files {
			if file.Path != filePath {
				continue
			}
			churn := file.Additions + file.Deletions
			commits = append(commits, Commit{OID: fact.OID, Subject: fact.Subject, Author: fact.Name, AuthorID: personID(identityKey(fact)), AuthoredAt: fact.Authored.Format(time.RFC3339), Additions: file.Additions, Deletions: file.Deletions, Churn: churn})
			break
		}
		if len(commits) == 50 {
			break
		}
	}
	return commits
}

func share(value, total int) float64 {
	if total == 0 {
		return 0
	}
	return float64(value) / float64(total)
}
