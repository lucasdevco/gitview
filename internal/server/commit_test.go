package server_test

import (
	"net/http"
	"net/url"
	"reflect"
	"strings"
	"testing"

	"gitview/internal/gittest"
)

type commitDetails struct {
	Oid        string       `json:"oid"`
	Parents    []string     `json:"parents"`
	Author     string       `json:"author"`
	Email      string       `json:"email"`
	AuthorTime int64        `json:"authorTime"`
	CommitTime int64        `json:"commitTime"`
	Subject    string       `json:"subject"`
	Body       string       `json:"body"`
	Files      []fileChange `json:"files"`
}

func (f fixture) commit(t *testing.T, oid string) commitDetails {
	t.Helper()
	response := f.get(t, "/api/v1/repos/"+f.repoID+"/commits/"+oid)
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	return decode[struct{ Data commitDetails }](t, response).Data
}

func commitDiffParams(oid, path string, oldPath ...string) url.Values {
	params := diffParams("commit", path, oldPath...)
	params.Set("commit", oid)
	return params
}

func TestCommitDetailsOfAnOrdinaryCommit(t *testing.T) {
	r := gittest.Init(t)
	base := r.Commit("keep.txt", "one\ntwo\n", "base")
	r.Write("gone.txt", "bye\n")
	r.Git("add", "gone.txt")
	r.Git("commit", "--quiet", "-m", "add gone")
	parent := r.Git("rev-parse", "HEAD")

	r.Write("keep.txt", "one\nTWO\n")
	r.Write("新 文件.txt", "hello\n")
	r.Git("rm", "--quiet", "gone.txt")
	r.Git("add", "--all")
	r.Git("commit", "--quiet", "-m", "Change things\n\nFirst body line.\n\nSecond paragraph\nwith two lines.")
	oid := r.Git("rev-parse", "HEAD")

	got := newFixture(t, r).commit(t, oid)
	want := commitDetails{
		Oid:        oid,
		Parents:    []string{parent},
		Author:     "Ada Lovelace",
		Email:      "ada@example.com",
		AuthorTime: 1767348000,
		CommitTime: 1767348000,
		Subject:    "Change things",
		Body:       "First body line.\n\nSecond paragraph\nwith two lines.",
		Files: []fileChange{
			{Path: "gone.txt", Status: "deleted"},
			{Path: "keep.txt", Status: "modified"},
			{Path: "新 文件.txt", Status: "added"},
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("commit details mismatch:\n got %+v\nwant %+v", got, want)
	}
	if base == parent {
		t.Fatal("fixture should have two commits before the one under test")
	}
}

func TestCommitDetailsAcceptAnAbbreviatedOid(t *testing.T) {
	r := gittest.Init(t)
	oid := r.Commit("a.txt", "a\n", "first")

	if got := newFixture(t, r).commit(t, oid[:10]); got.Oid != oid {
		t.Fatalf("oid = %q, want the full oid %q", got.Oid, oid)
	}
}

func TestCommitDetailsListRenames(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("old name.txt", "line 1\nline 2\nline 3\nline 4\nline 5\n", "base")
	r.Git("rm", "--quiet", "old name.txt")
	r.Write("目录/新 名字.txt", "line 1\nline 2\nline 3\nline 4\nline five\n")
	r.Git("add", "--all")
	r.Git("commit", "--quiet", "-m", "rename")
	oid := r.Git("rev-parse", "HEAD")
	f := newFixture(t, r)

	got := f.commit(t, oid)
	if want := []fileChange{{Path: "目录/新 名字.txt", OldPath: "old name.txt", Status: "renamed"}}; !reflect.DeepEqual(got.Files, want) {
		t.Fatalf("files = %+v, want %+v", got.Files, want)
	}
	diff := f.diff(t, commitDiffParams(oid, "目录/新 名字.txt", "old name.txt"))
	if !strings.Contains(diff.Patch, "rename from old name.txt") {
		t.Fatalf("expected a rename diff, got %+v", diff)
	}
	if want := "@@ -2,4 +2,4 @@ line 1\n line 2\n line 3\n line 4\n-line 5\n+line five\n"; hunks(t, diff) != want {
		t.Fatalf("rename hunks = %q, want %q", hunks(t, diff), want)
	}
}

func TestRootCommitDetailsAndDiff(t *testing.T) {
	r := gittest.Init(t)
	root := r.Commit("first.txt", "hello\n", "root")
	r.Commit("first.txt", "hello again\n", "second")
	f := newFixture(t, r)

	got := f.commit(t, root)
	if len(got.Parents) != 0 || got.Parents == nil {
		t.Fatalf("root parents = %#v, want an empty list", got.Parents)
	}
	if want := []fileChange{{Path: "first.txt", Status: "added"}}; !reflect.DeepEqual(got.Files, want) {
		t.Fatalf("files = %+v, want %+v", got.Files, want)
	}
	if want := "@@ -0,0 +1 @@\n+hello\n"; hunks(t, f.diff(t, commitDiffParams(root, "first.txt"))) != want {
		t.Fatalf("root diff hunks, want %q", want)
	}
}

func TestMergeCommitIsComparedWithItsFirstParent(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("shared.txt", "base\n", "base")
	r.Git("switch", "--quiet", "-c", "side")
	r.Commit("side.txt", "from side\n", "side work")
	side := r.Git("rev-parse", "HEAD")
	r.Git("switch", "--quiet", "main")
	main := r.Commit("main.txt", "from main\n", "main work")
	r.Git("merge", "--quiet", "--no-edit", "side")
	merge := r.Git("rev-parse", "HEAD")
	f := newFixture(t, r)

	got := f.commit(t, merge)
	if want := []string{main, side}; !reflect.DeepEqual(got.Parents, want) {
		t.Fatalf("parents = %v, want %v", got.Parents, want)
	}
	if want := []fileChange{{Path: "side.txt", Status: "added"}}; !reflect.DeepEqual(got.Files, want) {
		t.Fatalf("files = %+v, want what the merge brought into main: %+v", got.Files, want)
	}
	if want := "@@ -0,0 +1 @@\n+from side\n"; hunks(t, f.diff(t, commitDiffParams(merge, "side.txt"))) != want {
		t.Fatalf("merge diff hunks, want %q", want)
	}
}

func TestMergeCommitWithoutFileChangesHasAnEmptyFileList(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("shared.txt", "base\n", "base")
	r.Git("switch", "--quiet", "-c", "side")
	r.Commit("side.txt", "from side\n", "side work")
	r.Git("switch", "--quiet", "main")
	r.Commit("main.txt", "from main\n", "main work")
	r.Git("merge", "--quiet", "--no-edit", "--strategy=ours", "side")
	merge := r.Git("rev-parse", "HEAD")

	got := newFixture(t, r).commit(t, merge)
	if len(got.Parents) != 2 || got.Files == nil || len(got.Files) != 0 {
		t.Fatalf("want a two-parent commit with an empty file list, got %+v", got)
	}
}

func TestCommitDiffFlagsBinaryFiles(t *testing.T) {
	r := gittest.Init(t)
	oid := r.Commit("image.bin", "\x00\x01\x02binary\x00", "binary")

	got := newFixture(t, r).diff(t, commitDiffParams(oid, "image.bin"))
	if !got.Binary || got.Patch != "" {
		t.Fatalf("binary commit diff = %+v", got)
	}
}

func TestUnknownCommit(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "first")
	f := newFixture(t, r)

	for name, oid := range map[string]string{
		"missing commit": strings.Repeat("0", 40),
		"tree object":    r.Git("rev-parse", "HEAD^{tree}"),
	} {
		t.Run(name, func(t *testing.T) {
			response := f.get(t, "/api/v1/repos/"+f.repoID+"/commits/"+oid)
			body := decode[apiError](t, response)
			if response.Code != http.StatusNotFound || body.Error.Code != "commit_not_found" || body.Error.Message == "" {
				t.Fatalf("unexpected response %d: %s", response.Code, response.Body)
			}
		})
	}
}

func TestInvalidCommitRequests(t *testing.T) {
	r := gittest.Init(t)
	oid := r.Commit("a.txt", "a\n", "first")
	f := newFixture(t, r)

	for name, path := range map[string]string{
		"option-like oid":   "/commits/--output=x",
		"ref name":          "/commits/HEAD",
		"too short":         "/commits/abc",
		"diff without oid":  "/diff?" + diffParams("commit", "a.txt").Encode(),
		"diff option oid":   "/diff?" + commitDiffParams("--all", "a.txt").Encode(),
		"diff path outside": "/diff?" + commitDiffParams(oid, "../a.txt").Encode(),
	} {
		t.Run(name, func(t *testing.T) {
			response := f.get(t, "/api/v1/repos/"+f.repoID+path)
			body := decode[apiError](t, response)
			if response.Code != http.StatusBadRequest || body.Error.Code != "invalid_request" || body.Error.Message == "" {
				t.Fatalf("unexpected response %d: %s", response.Code, response.Body)
			}
		})
	}
}
