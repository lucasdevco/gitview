package overview

import "time"

const SchemaVersion = "2"

type Report struct {
	Repository      Repository    `json:"repository"`
	AnalysisContext Context       `json:"analysis_context"`
	Totals          Totals        `json:"totals"`
	MonthlyActivity []Month       `json:"monthly_activity"`
	Contributors    []Contributor `json:"contributors"`
	RecentCommits   []Commit      `json:"recent_commits"`
	Warnings        []Warning     `json:"warnings"`
}

type Repository struct {
	Name   string `json:"name"`
	Root   string `json:"root"`
	Branch string `json:"branch"`
	Head   string `json:"head"`
	Empty  bool   `json:"empty"`
}

type Context struct {
	Revision    string  `json:"revision"`
	Timezone    string  `json:"timezone"`
	TimeField   string  `json:"time_field"`
	MergePolicy string  `json:"merge_policy"`
	GeneratedAt string  `json:"generated_at"`
	Filters     Filters `json:"filters"`
}

type Filters struct {
	Since string `json:"since,omitempty"`
	Until string `json:"until,omitempty"`
	Path  string `json:"path,omitempty"`

	since          time.Time
	untilExclusive time.Time
	location       *time.Location
}

type Totals struct {
	Commits      int `json:"commits"`
	Contributors int `json:"contributors"`
	Additions    int `json:"additions"`
	Deletions    int `json:"deletions"`
	Churn        int `json:"churn"`
}

type Month struct {
	Month     string `json:"month"`
	Commits   int    `json:"commits"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Churn     int    `json:"churn"`
}

type Contributor struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	IsBot      bool   `json:"is_bot"`
	Commits    int    `json:"commits"`
	Additions  int    `json:"additions"`
	Deletions  int    `json:"deletions"`
	Churn      int    `json:"churn"`
	LastActive string `json:"last_active"`
}

type Commit struct {
	OID        string `json:"oid"`
	Subject    string `json:"subject"`
	Author     string `json:"author"`
	AuthorID   string `json:"author_id"`
	AuthoredAt string `json:"authored_at"`
	Additions  int    `json:"additions"`
	Deletions  int    `json:"deletions"`
	Churn      int    `json:"churn"`
}

type CommitReview struct {
	OID         string `json:"oid"`
	ParentOID   string `json:"parent_oid"`
	Subject     string `json:"subject"`
	Author      string `json:"author"`
	AuthorEmail string `json:"author_email"`
	AuthoredAt  string `json:"authored_at"`
	Files       int    `json:"files"`
	Additions   int    `json:"additions"`
	Deletions   int    `json:"deletions"`
	Patch       string `json:"patch"`
}

type CommitReviewReport struct {
	Repository Repository   `json:"repository"`
	Commit     CommitReview `json:"commit"`
}

type BranchRef struct {
	Name     string `json:"name"`
	FullName string `json:"full_name"`
	OID      string `json:"oid"`
	Remote   bool   `json:"remote"`
	Current  bool   `json:"current"`
}

type BranchCommit struct {
	OID        string   `json:"oid"`
	Parents    []string `json:"parents"`
	Subject    string   `json:"subject"`
	Author     string   `json:"author"`
	AuthoredAt string   `json:"authored_at"`
	Refs       []string `json:"refs"`
}

type WorkingTree struct {
	Dirty bool     `json:"dirty"`
	Files []string `json:"files"`
	Patch string   `json:"patch"`
}

type BranchReport struct {
	Repository  Repository     `json:"repository"`
	Branches    []BranchRef    `json:"branches"`
	Commits     []BranchCommit `json:"commits"`
	WorkingTree WorkingTree    `json:"working_tree"`
}

type Warning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type commitFact struct {
	OID       string
	Name      string
	Email     string
	Subject   string
	Authored  time.Time
	Additions int
	Deletions int
	Binary    int
	Files     []fileFact
}

type fileFact struct {
	Path      string
	Additions int
	Deletions int
	Binary    bool
}

type ContributorReport struct {
	Repository      Repository         `json:"repository"`
	AnalysisContext Context            `json:"analysis_context"`
	Contributor     Contributor        `json:"contributor"`
	MonthlyActivity []Month            `json:"monthly_activity"`
	TopPaths        []PathContribution `json:"top_paths"`
	RecentCommits   []Commit           `json:"recent_commits"`
	Warnings        []Warning          `json:"warnings"`
}

type PathContribution struct {
	Path      string `json:"path"`
	Commits   int    `json:"commits"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Churn     int    `json:"churn"`
}

type NotFoundError struct {
	Entity string
}

func (e *NotFoundError) Error() string { return e.Entity + " not found in the selected history" }

type FileReport struct {
	Repository      Repository   `json:"repository"`
	AnalysisContext Context      `json:"analysis_context"`
	Files           []FileMetric `json:"files"`
	Warnings        []Warning    `json:"warnings"`
	RecentDays      int          `json:"recent_days"`
}

type FileMetric struct {
	Path            string              `json:"path"`
	Commits         int                 `json:"commits"`
	Contributors    int                 `json:"contributors"`
	Additions       int                 `json:"additions"`
	Deletions       int                 `json:"deletions"`
	Churn           int                 `json:"churn"`
	LastChanged     string              `json:"last_changed"`
	LastContributor ContributorIdentity `json:"last_contributor"`
	HistoricalOwner ContributorIdentity `json:"historical_owner"`
	HistoricalShare float64             `json:"historical_share"`
	RecentOwner     ContributorIdentity `json:"recent_owner"`
	RecentShare     float64             `json:"recent_share"`
	BusFactor80     int                 `json:"bus_factor_80"`
	HotspotScore    float64             `json:"hotspot_score"`
	OwnershipRisk   float64             `json:"ownership_risk"`
}

type ContributorIdentity struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	IsBot bool   `json:"is_bot"`
}

type FileDetailReport struct {
	Repository      Repository        `json:"repository"`
	AnalysisContext Context           `json:"analysis_context"`
	File            FileMetric        `json:"file"`
	Contributors    []FileContributor `json:"contributors"`
	RecentCommits   []Commit          `json:"recent_commits"`
	Warnings        []Warning         `json:"warnings"`
	RecentDays      int               `json:"recent_days"`
}

type FileContributor struct {
	Contributor ContributorIdentity `json:"contributor"`
	Commits     int                 `json:"commits"`
	Churn       int                 `json:"churn"`
	Share       float64             `json:"share"`
	LastActive  string              `json:"last_active"`
}

type CompareReport struct {
	Repository      Repository    `json:"repository"`
	AnalysisContext Context       `json:"analysis_context"`
	FromRef         string        `json:"from_ref"`
	ToRef           string        `json:"to_ref"`
	FromRevision    string        `json:"from_revision"`
	ToRevision      string        `json:"to_revision"`
	Totals          Totals        `json:"totals"`
	Contributors    []Contributor `json:"contributors"`
	Files           []FileMetric  `json:"files"`
	Commits         []Commit      `json:"commits"`
	Warnings        []Warning     `json:"warnings"`
}

type ExplainReport struct {
	Repository      Repository         `json:"repository"`
	AnalysisContext Context            `json:"analysis_context"`
	Month           string             `json:"month"`
	Totals          Totals             `json:"totals"`
	Contributors    []Contributor      `json:"contributors"`
	Paths           []PathContribution `json:"paths"`
	Commits         []Commit           `json:"commits"`
	Insights        []Insight          `json:"insights"`
	Warnings        []Warning          `json:"warnings"`
}

type Insight struct {
	Kind    string `json:"kind"`
	Title   string `json:"title"`
	Summary string `json:"summary"`
}
