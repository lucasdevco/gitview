package function

import (
	"bytes"
	"context"
	"io"
	"testing"
	"time"

	"gitview/internal/overview"
)

type fakeGit struct {
	files   []SourceFile
	history string
}

func (f fakeGit) Repository(context.Context) (overview.Repository, error) {
	return overview.Repository{Name: "fixture", Head: "head"}, nil
}
func (f fakeGit) GoFiles(context.Context, string) ([]SourceFile, error) { return f.files, nil }
func (f fakeGit) GoHistory(_ context.Context, _ string, output io.Writer) error {
	_, err := io.Copy(output, bytes.NewBufferString(f.history))
	return err
}
func (f fakeGit) IsShallow(context.Context) (bool, error) { return false, nil }

func TestGoASTAndHistoryProduceExplainableFunctionMetrics(t *testing.T) {
	source := "package sample\n\nfunc Parse(input string) bool {\n\tif input == \"yes\" || input == \"y\" {\n\t\treturn true\n\t}\n\treturn false\n}\n"
	history := "\x1eabc\x1fAda\x1fada@example.com\x1f2026-07-01T10:00:00Z\x1fadd parser\n" +
		"diff --git parser.go parser.go\n--- /dev/null\n+++ parser.go\n@@ -0,0 +1,8 @@\n"
	service := NewService(fakeGit{files: []SourceFile{{Path: "parser.go", Content: []byte(source)}}, history: history})
	service.now = func() time.Time { return time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC) }
	report, err := service.Functions(context.Background(), overview.Filters{}, "hotspot", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Functions) != 1 {
		t.Fatalf("unexpected functions: %+v", report.Functions)
	}
	metric := report.Functions[0]
	if metric.QualifiedName != "Parse" || metric.Complexity != 3 || metric.Changes != 1 || metric.Churn != 8 || metric.HotspotScore != 100 {
		t.Fatalf("unexpected metric: %+v", metric)
	}
	if metric.Owner.Name != "Ada" || metric.OwnerShare != 1 || metric.LineageConfidence != "probable" {
		t.Fatalf("unexpected ownership: %+v", metric)
	}
	detail, err := service.Function(context.Background(), overview.Filters{}, metric.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.History) != 1 || detail.History[0].OID != "abc" || detail.History[0].Confidence != "probable" {
		t.Fatalf("unexpected history: %+v", detail.History)
	}
}

func TestMethodIdentityIncludesReceiver(t *testing.T) {
	source := "package sample\ntype Parser struct{}\nfunc (p *Parser) Parse() {}\n"
	symbols, failures, _ := parseFiles([]SourceFile{{Path: "parser.go", Content: []byte(source)}})
	if failures != 0 || len(symbols["parser.go"]) != 1 || symbols["parser.go"][0].metric.QualifiedName != "Parser.Parse" {
		t.Fatalf("unexpected symbols: %#v, failures %d", symbols, failures)
	}
}

func TestEmptyFunctionResultUsesEmptySlice(t *testing.T) {
	service := NewService(fakeGit{files: []SourceFile{}, history: ""})
	report, err := service.Functions(context.Background(), overview.Filters{}, "hotspot", 20)
	if err != nil {
		t.Fatal(err)
	}
	if report.Functions == nil || len(report.Functions) != 0 {
		t.Fatalf("expected an empty function slice, got %#v", report.Functions)
	}
}

func TestDateFilterUsesInclusiveAuthorDates(t *testing.T) {
	source := "package sample\nfunc Parse() {}\n"
	history := "\x1eold\x1fAda\x1fa@example.com\x1f2026-06-30T10:00:00+08:00\x1fold\n+++ parser.go\n@@ -1 +1 @@\n" +
		"\x1enew\x1fAda\x1fa@example.com\x1f2026-07-01T10:00:00+08:00\x1fnew\n+++ parser.go\n@@ -2 +2 @@\n"
	service := NewService(fakeGit{files: []SourceFile{{Path: "parser.go", Content: []byte(source)}}, history: history})
	report, err := service.Functions(context.Background(), overview.Filters{Since: "2026-07-01", Until: "2026-07-01"}, "hotspot", 20)
	if err != nil {
		t.Fatal(err)
	}
	if report.Functions[0].Changes != 1 {
		t.Fatalf("unexpected filtered metric: %+v", report.Functions[0])
	}
}
