package overview

import "time"

const SchemaVersion = "1"

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
	Revision    string `json:"revision"`
	Timezone    string `json:"timezone"`
	TimeField   string `json:"time_field"`
	MergePolicy string `json:"merge_policy"`
	GeneratedAt string `json:"generated_at"`
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
	Name       string `json:"name"`
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
	AuthoredAt string `json:"authored_at"`
	Additions  int    `json:"additions"`
	Deletions  int    `json:"deletions"`
	Churn      int    `json:"churn"`
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
}
