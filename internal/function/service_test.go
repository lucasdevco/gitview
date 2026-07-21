package function

import (
	"bytes"
	"context"
	"io"
	"sync/atomic"
	"testing"
	"time"

	"gitview/internal/overview"
)

type fakeGit struct {
	files         []SourceFile
	history       string
	sourceCalls   *atomic.Int32
	historyCalls  *atomic.Int32
	sourceStarted chan<- struct{}
	sourceRelease <-chan struct{}
}

func (f fakeGit) Repository(context.Context) (overview.Repository, error) {
	return overview.Repository{Name: "fixture", Head: "head"}, nil
}
func (f fakeGit) SourceFiles(context.Context, string) ([]SourceFile, error) {
	if f.sourceCalls != nil {
		f.sourceCalls.Add(1)
	}
	if f.sourceStarted != nil {
		select {
		case f.sourceStarted <- struct{}{}:
		default:
		}
	}
	if f.sourceRelease != nil {
		<-f.sourceRelease
	}
	return f.files, nil
}
func (f fakeGit) FunctionHistory(_ context.Context, _ string, output io.Writer) error {
	if f.historyCalls != nil {
		f.historyCalls.Add(1)
	}
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

func TestTreeSitterParsesSupportedLanguages(t *testing.T) {
	tests := []struct {
		path       string
		source     string
		qualified  string
		language   string
		complexity int
	}{
		{path: "app.js", source: "const load = async (ready) => { if (ready) return 1; return 0 }\n", qualified: "load", language: "JavaScript", complexity: 2},
		{path: "app.ts", source: "class Store { load(ready: boolean) { return ready ? 1 : 0 } }\n", qualified: "Store.load", language: "TypeScript", complexity: 2},
		{path: "app.py", source: "class Store:\n    def load(self, ready):\n        if ready:\n            return 1\n        return 0\n", qualified: "Store.load", language: "Python", complexity: 2},
		{path: "Store.java", source: "class Store { int load(boolean ready) { return ready ? 1 : 0; } }\n", qualified: "Store.load", language: "Java", complexity: 2},
		{path: "src/lib.rs", source: "struct Store; impl Store { fn load(&self, ready: bool) -> i32 { if ready { 1 } else { 0 } } }\n", qualified: "Store.load", language: "Rust", complexity: 2},
	}
	for _, test := range tests {
		t.Run(test.language, func(t *testing.T) {
			symbols, failures, _ := parseFiles([]SourceFile{{Path: test.path, Content: []byte(test.source)}})
			if failures != 0 || len(symbols[test.path]) != 1 {
				t.Fatalf("unexpected symbols: %#v, failures %d", symbols, failures)
			}
			metric := symbols[test.path][0].metric
			if metric.QualifiedName != test.qualified || metric.Language != test.language || metric.Complexity != test.complexity {
				t.Fatalf("unexpected metric: %+v", metric)
			}
		})
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

func TestFunctionReportIncludesTruncationMetadata(t *testing.T) {
	service := NewService(fakeGit{files: []SourceFile{{Path: "parser.go", Content: []byte("package sample\nfunc One() {}\nfunc Two() {}\n")}}})
	report, err := service.Functions(context.Background(), overview.Filters{}, "hotspot", 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Functions) != 1 || report.Total != 2 || report.Limit != 1 || !report.HasMore {
		t.Fatalf("unexpected truncation metadata: %+v", report)
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

func TestDateFiltersReuseSnapshotAndHistoryFacts(t *testing.T) {
	source := "package sample\nfunc Parse() {}\n"
	history := "\x1eold\x1fAda\x1fa@example.com\x1f2026-06-30T10:00:00Z\x1fold\n+++ parser.go\n@@ -2 +2 @@\n" +
		"\x1enew\x1fAda\x1fa@example.com\x1f2026-07-01T10:00:00Z\x1fnew\n+++ parser.go\n@@ -2 +2 @@\n"
	var sourceCalls, historyCalls atomic.Int32
	service := NewService(fakeGit{
		files: []SourceFile{{Path: "parser.go", Content: []byte(source)}}, history: history,
		sourceCalls: &sourceCalls, historyCalls: &historyCalls,
	})
	first, err := service.Functions(context.Background(), overview.Filters{Since: "2026-06-01", Until: "2026-06-30"}, "hotspot", 20)
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Functions(context.Background(), overview.Filters{Since: "2026-07-01", Until: "2026-07-31"}, "hotspot", 20)
	if err != nil {
		t.Fatal(err)
	}
	if first.Functions[0].Changes != 1 || second.Functions[0].Changes != 1 {
		t.Fatalf("unexpected filtered results: %+v %+v", first.Functions[0], second.Functions[0])
	}
	if sourceCalls.Load() != 1 || historyCalls.Load() != 1 {
		t.Fatalf("expected facts to be loaded once, got source=%d history=%d", sourceCalls.Load(), historyCalls.Load())
	}
}

func TestConcurrentFunctionRequestsShareFactLoad(t *testing.T) {
	var sourceCalls, historyCalls atomic.Int32
	started := make(chan struct{}, 1)
	release := make(chan struct{})
	service := NewService(fakeGit{
		files:       []SourceFile{{Path: "parser.go", Content: []byte("package sample\nfunc Parse() {}\n")}},
		sourceCalls: &sourceCalls, historyCalls: &historyCalls, sourceStarted: started, sourceRelease: release,
	})
	errors := make(chan error, 2)
	go func() {
		_, err := service.Functions(context.Background(), overview.Filters{}, "hotspot", 20)
		errors <- err
	}()
	<-started
	go func() {
		_, err := service.Functions(context.Background(), overview.Filters{}, "hotspot", 20)
		errors <- err
	}()
	close(release)
	for range 2 {
		if err := <-errors; err != nil {
			t.Fatal(err)
		}
	}
	if sourceCalls.Load() != 1 || historyCalls.Load() != 1 {
		t.Fatalf("expected one shared load, got source=%d history=%d", sourceCalls.Load(), historyCalls.Load())
	}
}
