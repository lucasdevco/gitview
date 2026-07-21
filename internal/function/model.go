package function

import "gitview/internal/overview"

const AnalyzerVersion = "tree-sitter-current-range-v1"

type SourceFile struct {
	Path    string
	Content []byte
}

type Report struct {
	Repository      overview.Repository `json:"repository"`
	AnalysisContext overview.Context    `json:"analysis_context"`
	Functions       []Metric            `json:"functions"`
	Warnings        []overview.Warning  `json:"warnings"`
	AnalyzerVersion string              `json:"analyzer_version"`
	Total           int                 `json:"total"`
	Limit           int                 `json:"limit"`
	HasMore         bool                `json:"has_more"`
}

type DetailReport struct {
	Repository      overview.Repository `json:"repository"`
	AnalysisContext overview.Context    `json:"analysis_context"`
	Function        Metric              `json:"function"`
	History         []Change            `json:"history"`
	Warnings        []overview.Warning  `json:"warnings"`
	AnalyzerVersion string              `json:"analyzer_version"`
}

type Metric struct {
	ID                string                       `json:"id"`
	Name              string                       `json:"name"`
	QualifiedName     string                       `json:"qualified_name"`
	Signature         string                       `json:"signature"`
	Language          string                       `json:"language"`
	Path              string                       `json:"path"`
	StartLine         int                          `json:"start_line"`
	EndLine           int                          `json:"end_line"`
	Lines             int                          `json:"lines"`
	Complexity        int                          `json:"complexity"`
	Changes           int                          `json:"changes"`
	Additions         int                          `json:"additions"`
	Deletions         int                          `json:"deletions"`
	Churn             int                          `json:"churn"`
	HotspotScore      float64                      `json:"hotspot_score"`
	Owner             overview.ContributorIdentity `json:"owner"`
	OwnerShare        float64                      `json:"owner_share"`
	LineageConfidence string                       `json:"lineage_confidence"`
}

type Change struct {
	OID        string `json:"oid"`
	Subject    string `json:"subject"`
	Author     string `json:"author"`
	AuthorID   string `json:"author_id"`
	AuthoredAt string `json:"authored_at"`
	Additions  int    `json:"additions"`
	Deletions  int    `json:"deletions"`
	Churn      int    `json:"churn"`
	Confidence string `json:"confidence"`
}

type NotFoundError struct{}

func (*NotFoundError) Error() string { return "function not found in the selected snapshot" }
