package overview

import (
	"testing"
	"time"
)

func TestBuildFileMetricsShowsHotspotAndOwnershipComponents(t *testing.T) {
	facts := []commitFact{
		{OID: "new", Name: "Bob", Email: "bob@example.com", Authored: time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC), Files: []fileFact{{Path: "hot.go", Additions: 20}, {Path: "cold.go", Additions: 1}}},
		{OID: "old", Name: "Ada", Email: "ada@example.com", Authored: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC), Files: []fileFact{{Path: "hot.go", Additions: 80}}},
	}
	metrics, _ := buildFileMetrics(facts, time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC), 180)
	sortFileMetrics(metrics, "hotspot")
	if len(metrics) != 2 || metrics[0].Path != "hot.go" || metrics[0].HotspotScore != 100 {
		t.Fatalf("unexpected hotspots: %+v", metrics)
	}
	hot := metrics[0]
	if hot.HistoricalOwner.Name != "Ada" || hot.HistoricalShare != 0.8 {
		t.Fatalf("unexpected historical ownership: %+v", hot)
	}
	if hot.RecentOwner.Name != "Bob" || hot.RecentShare != 1 || hot.BusFactor80 != 1 {
		t.Fatalf("unexpected recent ownership: %+v", hot)
	}
}

func TestFileCommitsUseFileSpecificChurn(t *testing.T) {
	facts := []commitFact{{
		OID: "one", Name: "Ada", Email: "ada@example.com", Authored: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Subject: "change",
		Files: []fileFact{{Path: "a.go", Additions: 2, Deletions: 1}, {Path: "b.go", Additions: 100}},
	}}
	commits := fileCommits(facts, "a.go")
	if len(commits) != 1 || commits[0].Churn != 3 || commits[0].Additions != 2 {
		t.Fatalf("unexpected evidence: %+v", commits)
	}
}

func TestBinaryContributionUsesWeightWithoutReportingFalseChurn(t *testing.T) {
	facts := []commitFact{{
		OID: "one", Name: "Ada", Email: "ada@example.com", Authored: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		Files: []fileFact{{Path: "image.png", Binary: true}},
	}}
	_, accumulators := buildFileMetrics(facts, time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), 180)
	identity := accumulators["image.png"].Identities[identityKey(facts[0])]
	if identity.Weight != 1 || identity.Churn != 0 {
		t.Fatalf("expected binary ownership weight without fabricated churn, got %+v", identity)
	}
}
