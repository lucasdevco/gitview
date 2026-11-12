package server_test

import (
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"gitview/internal/gittest"
)

type fileChange struct {
	Path    string `json:"path"`
	OldPath string `json:"oldPath"`
	Status  string `json:"status"`
}

type worktreeStatus struct {
	Staged     []fileChange `json:"staged"`
	Unstaged   []fileChange `json:"unstaged"`
	Untracked  []fileChange `json:"untracked"`
	Conflicted []fileChange `json:"conflicted"`
}

func (f fixture) status(t *testing.T) worktreeStatus {
	t.Helper()
	response := f.get(t, "/api/v1/repos/"+f.repoID+"/status")
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	return decode[struct{ Data worktreeStatus }](t, response).Data
}

func TestStatusListsStagedUnstagedAndUntrackedFiles(t *testing.T) {
	r := gittest.Init(t)
	r.Write("modified.txt", "one\n")
	r.Write("deleted.txt", "gone soon\n")
	r.Write("old name.txt", "a file that will be renamed\nwith enough content\nto be detected\n")
	r.Write("both.txt", "base\n")
	r.Write("worktree-deleted.txt", "x\n")
	r.Git("add", "--all")
	r.Git("commit", "--quiet", "-m", "base")

	r.Write("modified.txt", "two\n")
	r.Git("add", "modified.txt")
	r.Git("rm", "--quiet", "deleted.txt")
	if err := os.Mkdir(filepath.Join(r.Dir, "目录"), 0o755); err != nil {
		t.Fatal(err)
	}
	r.Git("mv", "old name.txt", "目录/新 名字.txt")
	r.Write("added.txt", "new\n")
	r.Git("add", "added.txt")
	r.Write("both.txt", "staged\n")
	r.Git("add", "both.txt")
	r.Write("both.txt", "staged\nand unstaged\n")
	if err := os.Remove(filepath.Join(r.Dir, "worktree-deleted.txt")); err != nil {
		t.Fatal(err)
	}
	r.Write("untracked dir/spaced \"quoted\" name.txt", "u\n")
	r.Write("-dash.txt", "d\n")

	got := newFixture(t, r).status(t)
	want := worktreeStatus{
		Staged: []fileChange{
			{Path: "added.txt", Status: "added"},
			{Path: "both.txt", Status: "modified"},
			{Path: "deleted.txt", Status: "deleted"},
			{Path: "modified.txt", Status: "modified"},
			{Path: "目录/新 名字.txt", OldPath: "old name.txt", Status: "renamed"},
		},
		Unstaged: []fileChange{
			{Path: "both.txt", Status: "modified"},
			{Path: "worktree-deleted.txt", Status: "deleted"},
		},
		Untracked: []fileChange{
			{Path: "-dash.txt", Status: "untracked"},
			{Path: "untracked dir/spaced \"quoted\" name.txt", Status: "untracked"},
		},
		Conflicted: []fileChange{},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("status mismatch:\n got %+v\nwant %+v", got, want)
	}
}

func TestStatusOfACleanAndAnEmptyRepository(t *testing.T) {
	empty := gittest.Init(t)
	clean := gittest.Init(t)
	clean.Commit("a.txt", "a\n", "first")
	want := worktreeStatus{Staged: []fileChange{}, Unstaged: []fileChange{}, Untracked: []fileChange{}, Conflicted: []fileChange{}}
	for name, r := range map[string]*gittest.Repo{"empty": empty, "clean": clean} {
		if got := newFixture(t, r).status(t); !reflect.DeepEqual(got, want) {
			t.Fatalf("%s: unexpected status %+v", name, got)
		}
	}
}

func TestStatusInAnEmptyRepositoryShowsStagedFiles(t *testing.T) {
	r := gittest.Init(t)
	r.Write("first.txt", "hello\n")
	r.Git("add", "first.txt")

	got := newFixture(t, r).status(t)
	if want := []fileChange{{Path: "first.txt", Status: "added"}}; !reflect.DeepEqual(got.Staged, want) {
		t.Fatalf("staged = %+v, want %+v", got.Staged, want)
	}
}

func TestStatusListsConflictedFiles(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("conflict.txt", "base\n", "base")
	r.Git("switch", "--quiet", "-c", "other")
	r.Commit("conflict.txt", "other\n", "other")
	r.Git("switch", "--quiet", "main")
	r.Commit("conflict.txt", "main\n", "main")
	r.GitFails("merge", "other")

	got := newFixture(t, r).status(t)
	if want := []fileChange{{Path: "conflict.txt", Status: "conflicted"}}; !reflect.DeepEqual(got.Conflicted, want) {
		t.Fatalf("conflicted = %+v, want %+v", got.Conflicted, want)
	}
	if len(got.Staged) != 0 || len(got.Unstaged) != 0 {
		t.Fatalf("conflicted file also listed as staged/unstaged: %+v", got)
	}
}

// diff fetches a file diff with the given query parameters.
func (f fixture) diff(t *testing.T, params url.Values) fileDiff {
	t.Helper()
	response := f.get(t, "/api/v1/repos/"+f.repoID+"/diff?"+params.Encode())
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	return decode[struct{ Data fileDiff }](t, response).Data
}

type fileDiff struct {
	Path     string `json:"path"`
	OldPath  string `json:"oldPath"`
	Binary   bool   `json:"binary"`
	TooLarge bool   `json:"tooLarge"`
	Patch    string `json:"patch"`
}

func diffParams(source, path string, oldPath ...string) url.Values {
	params := url.Values{"source": {source}, "path": {path}}
	if len(oldPath) > 0 {
		params.Set("oldPath", oldPath[0])
	}
	return params
}

// hunks returns the patch from its first hunk header on, the part a reader
// sees as the diff body.
func hunks(t *testing.T, d fileDiff) string {
	t.Helper()
	index := strings.Index(d.Patch, "@@ ")
	if index < 0 {
		t.Fatalf("patch has no hunk: %q", d.Patch)
	}
	return d.Patch[index:]
}

func TestStagedAndUnstagedDiffsShowTheirOwnSideOfAFile(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("notes.txt", "one\ntwo\nthree\n", "base")
	r.Write("notes.txt", "one\nTWO\nthree\n")
	r.Git("add", "notes.txt")
	r.Write("notes.txt", "one\nTWO\nthree\nfour\n")
	f := newFixture(t, r)

	staged := f.diff(t, diffParams("staged", "notes.txt"))
	if want := "@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n"; hunks(t, staged) != want || staged.Path != "notes.txt" {
		t.Fatalf("staged diff = %+v, want hunks %q", staged, want)
	}
	unstaged := f.diff(t, diffParams("unstaged", "notes.txt"))
	if want := "@@ -1,3 +1,4 @@\n one\n TWO\n three\n+four\n"; hunks(t, unstaged) != want {
		t.Fatalf("unstaged diff = %+v, want hunks %q", unstaged, want)
	}
}

func TestStagedRenameIsDiffedAsARename(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("old name.txt", "line 1\nline 2\nline 3\nline 4\nline 5\n", "base")
	r.Git("mv", "old name.txt", "新 名字.txt")
	r.Write("新 名字.txt", "line 1\nline 2\nline 3\nline 4\nline five\n")
	r.Git("add", "--all")

	got := newFixture(t, r).diff(t, diffParams("staged", "新 名字.txt", "old name.txt"))
	if got.Path != "新 名字.txt" || got.OldPath != "old name.txt" || !strings.Contains(got.Patch, "rename from old name.txt") {
		t.Fatalf("expected a rename diff, got %+v", got)
	}
	if want := "@@ -2,4 +2,4 @@ line 1\n line 2\n line 3\n line 4\n-line 5\n+line five\n"; hunks(t, got) != want {
		t.Fatalf("rename hunks = %q, want %q", hunks(t, got), want)
	}
}

func TestUntrackedFileDiffShowsItsWholeContentAsAdded(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	r.Write("新 目录/-odd [name].txt", "first\nsecond")
	r.Write("-odd [name].txt", "decoy that a glob pathspec would also match\n")

	got := newFixture(t, r).diff(t, diffParams("untracked", "新 目录/-odd [name].txt"))
	if want := "@@ -0,0 +1,2 @@\n+first\n+second\n\\ No newline at end of file\n"; hunks(t, got) != want {
		t.Fatalf("untracked hunks = %q, want %q", hunks(t, got), want)
	}
}

func TestDiffPathsAreLiteralNotGlobs(t *testing.T) {
	r := gittest.Init(t)
	r.Write("a1.txt", "glob match\n")
	r.Commit("a[1].txt", "literal\n", "base")
	r.Write("a1.txt", "glob match changed\n")
	r.Write("a[1].txt", "literal changed\n")

	got := newFixture(t, r).diff(t, diffParams("unstaged", "a[1].txt"))
	if want := "@@ -1 +1 @@\n-literal\n+literal changed\n"; hunks(t, got) != want {
		t.Fatalf("hunks = %q, want %q", hunks(t, got), want)
	}
}

func TestDiffOfStagedFilesInAnEmptyRepository(t *testing.T) {
	r := gittest.Init(t)
	r.Write("first.txt", "hello\n")
	r.Git("add", "first.txt")

	got := newFixture(t, r).diff(t, diffParams("staged", "first.txt"))
	if want := "@@ -0,0 +1 @@\n+hello\n"; hunks(t, got) != want {
		t.Fatalf("hunks = %q, want %q", hunks(t, got), want)
	}
}

func TestDiffOfADeletedFile(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("gone.txt", "bye\n", "base")
	r.Git("rm", "--quiet", "gone.txt")

	got := newFixture(t, r).diff(t, diffParams("staged", "gone.txt"))
	if want := "@@ -1 +0,0 @@\n-bye\n"; hunks(t, got) != want {
		t.Fatalf("hunks = %q, want %q", hunks(t, got), want)
	}
}

func TestBinaryAndOversizedDiffsAreFlaggedInsteadOfReturned(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	r.Write("image.bin", "\x00\x01\x02binary\x00")
	r.Git("add", "image.bin")
	r.Write("huge.txt", strings.Repeat("a long line of generated text for a big file\n", 30000))
	f := newFixture(t, r)

	binary := f.diff(t, diffParams("staged", "image.bin"))
	if !binary.Binary || binary.TooLarge || binary.Patch != "" {
		t.Fatalf("binary diff = %+v", binary)
	}
	huge := f.diff(t, diffParams("untracked", "huge.txt"))
	if !huge.TooLarge || huge.Binary || huge.Patch != "" {
		t.Fatalf("huge diff = binary %v tooLarge %v patch %d bytes", huge.Binary, huge.TooLarge, len(huge.Patch))
	}
}

func TestDiffOfAnUnchangedPathIsEmpty(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")

	got := newFixture(t, r).diff(t, diffParams("unstaged", "a.txt"))
	if got.Patch != "" || got.Binary || got.TooLarge {
		t.Fatalf("expected an empty diff, got %+v", got)
	}
}

func TestInvalidDiffRequests(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	f := newFixture(t, r)
	cases := map[string]url.Values{
		"missing path":            {"source": {"unstaged"}},
		"unknown source":          diffParams("sideways", "a.txt"),
		"missing source":          {"path": {"a.txt"}},
		"path outside repository": diffParams("untracked", "../outside.txt"),
		"absolute path":           diffParams("untracked", "/etc/hosts"),
		"old path outside":        diffParams("staged", "a.txt", "../a.txt"),
	}
	for name, params := range cases {
		t.Run(name, func(t *testing.T) {
			response := f.get(t, "/api/v1/repos/"+f.repoID+"/diff?"+params.Encode())
			body := decode[apiError](t, response)
			if response.Code != http.StatusBadRequest || body.Error.Code != "invalid_request" || body.Error.Message == "" {
				t.Fatalf("unexpected response %d: %s", response.Code, response.Body)
			}
		})
	}
}
