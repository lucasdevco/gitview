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

type stashEntry struct {
	Index   int    `json:"index"`
	Name    string `json:"name"`
	Oid     string `json:"oid"`
	Message string `json:"message"`
	Time    int64  `json:"time"`
}

type stashDetails struct {
	stashEntry
	Base  string       `json:"base"`
	Files []fileChange `json:"files"`
}

func (f fixture) stashes(t *testing.T) []stashEntry {
	t.Helper()
	response := f.get(t, "/api/v1/repos/"+f.repoID+"/stashes")
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	return decode[struct{ Data []stashEntry }](t, response).Data
}

func (f fixture) stash(t *testing.T, index string) stashDetails {
	t.Helper()
	response := f.get(t, "/api/v1/repos/"+f.repoID+"/stashes/"+index)
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	return decode[struct{ Data stashDetails }](t, response).Data
}

func stashDiffParams(oid, path string) url.Values {
	params := diffParams("stash", path)
	params.Set("commit", oid)
	return params
}

func readFile(t *testing.T, r *gittest.Repo, path string) string {
	t.Helper()
	content, err := os.ReadFile(filepath.Join(r.Dir, path))
	if err != nil {
		t.Fatal(err)
	}
	return string(content)
}

func TestStashSavesTrackedAndUntrackedChangesAndCleansTheWorkingTree(t *testing.T) {
	r := gittest.Init(t)
	base := r.Commit("notes.txt", "one\ntwo\n", "base")
	r.Write("notes.txt", "one\nTWO\n")
	r.Write("staged.txt", "staged\n")
	r.Git("add", "staged.txt")
	r.Write("new dir/untracked.txt", "fresh\n")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "stash-push", map[string]any{"message": "half-done login"})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git stash push --include-untracked -m 'half-done login'" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if status := f.status(t); len(status.Staged)+len(status.Unstaged)+len(status.Untracked) != 0 {
		t.Fatalf("working tree not clean: %+v", status)
	}
	list := f.stashes(t)
	if len(list) != 1 || list[0].Index != 0 || list[0].Name != "stash@{0}" || list[0].Message != "On main: half-done login" ||
		list[0].Oid == "" || list[0].Time == 0 {
		t.Fatalf("unexpected stash list: %+v", list)
	}

	got := f.stash(t, "0")
	want := stashDetails{
		stashEntry: list[0],
		Base:       base,
		Files: []fileChange{
			{Path: "notes.txt", Status: "modified"},
			{Path: "staged.txt", Status: "added"},
			{Path: "new dir/untracked.txt", Status: "untracked"},
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("stash details mismatch:\n got %+v\nwant %+v", got, want)
	}

	if got := hunks(t, f.diff(t, stashDiffParams(list[0].Oid, "notes.txt"))); got != "@@ -1,2 +1,2 @@\n one\n-two\n+TWO\n" {
		t.Fatalf("tracked diff = %q", got)
	}
	if got := hunks(t, f.diff(t, stashDiffParams(list[0].Oid, "new dir/untracked.txt"))); got != "@@ -0,0 +1 @@\n+fresh\n" {
		t.Fatalf("untracked diff = %q", got)
	}
}

func TestStashWithoutMessageAndKeepingStagedChanges(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	r.Write("a.txt", "staged a\n")
	r.Git("add", "a.txt")
	r.Write("b.txt", "untracked b\n")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "stash-push", map[string]any{"message": "  ", "keepIndex": true})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git stash push --include-untracked --keep-index" {
		t.Fatalf("unexpected commands: %q", got)
	}
	status := f.status(t)
	if got := paths(status.Staged); len(got) != 1 || got[0] != "a.txt" {
		t.Fatalf("staged changes not kept: %+v", status)
	}
	if len(status.Untracked) != 0 || len(status.Unstaged) != 0 {
		t.Fatalf("unstaged or untracked changes left: %+v", status)
	}
	list := f.stashes(t)
	if len(list) != 1 || !strings.HasPrefix(list[0].Message, "WIP on main: ") {
		t.Fatalf("unexpected stash list: %+v", list)
	}
	if got := paths(f.stash(t, "0").Files); strings.Join(got, ",") != "a.txt,b.txt" {
		t.Fatalf("stash files = %q", got)
	}
}

func TestStashOfACleanWorkingTreeIsRejected(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	f := newFixture(t, r)

	code, response := f.operate(t, "stash-push", map[string]any{})

	if code != http.StatusBadRequest || response.Error.Code != "invalid_request" ||
		!strings.Contains(response.Error.Message, "no local changes") {
		t.Fatalf("unexpected response %d: %+v", code, response.Error)
	}
	if list := f.stashes(t); len(list) != 0 {
		t.Fatalf("a stash was created: %+v", list)
	}
}

func TestStashListIsNewestFirst(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	f := newFixture(t, r)
	if list := f.stashes(t); list == nil || len(list) != 0 {
		t.Fatalf("expected an empty list, got %+v", list)
	}
	r.Write("a.txt", "first\n")
	f.mustOperate(t, "stash-push", map[string]any{"message": "first"})
	r.Write("a.txt", "second\n")
	f.mustOperate(t, "stash-push", map[string]any{"message": "second"})

	list := f.stashes(t)
	if len(list) != 2 || list[0].Message != "On main: second" || list[1].Message != "On main: first" ||
		list[1].Index != 1 || list[1].Name != "stash@{1}" {
		t.Fatalf("unexpected stash list: %+v", list)
	}
	if got := f.stash(t, "1"); got.Oid != list[1].Oid {
		t.Fatalf("stash 1 = %+v", got)
	}
}

func TestApplyStashRestoresItsChangesAndKeepsIt(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	r.Write("a.txt", "changed\n")
	r.Write("new.txt", "new\n")
	f := newFixture(t, r)
	f.mustOperate(t, "stash-push", map[string]any{"message": "work"})
	stash := f.stashes(t)[0]

	commands := f.mustOperate(t, "stash-apply", map[string]any{"index": 0, "oid": stash.Oid})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git stash apply 'stash@{0}'" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := readFile(t, r, "a.txt"); got != "changed\n" {
		t.Fatalf("a.txt = %q", got)
	}
	if got := readFile(t, r, "new.txt"); got != "new\n" {
		t.Fatalf("new.txt = %q", got)
	}
	if list := f.stashes(t); len(list) != 1 || list[0].Oid != stash.Oid {
		t.Fatalf("stash not kept: %+v", list)
	}
}

func TestApplyingAConflictingStashReportsTheConflict(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "base\n", "base")
	r.Write("a.txt", "from stash\n")
	f := newFixture(t, r)
	f.mustOperate(t, "stash-push", map[string]any{"message": "work"})
	r.Commit("a.txt", "committed meanwhile\n", "conflicting change")
	stash := f.stashes(t)[0]

	code, response := f.operate(t, "stash-apply", map[string]any{"index": 0, "oid": stash.Oid})

	if code != http.StatusConflict || response.Error.Code != "conflict" {
		t.Fatalf("unexpected response %d: %+v", code, response.Error)
	}
	if !strings.Contains(response.Error.Output, "CONFLICT (content): Merge conflict in a.txt") {
		t.Fatalf("output does not name the conflict: %q", response.Error.Output)
	}
	if got := commandStrings(response.Error.Commands); len(got) != 1 || got[0] != "git stash apply 'stash@{0}'" ||
		response.Error.Commands[0].Error != "conflict" {
		t.Fatalf("unexpected commands: %+v", response.Error.Commands)
	}
	if got := paths(f.status(t).Conflicted); len(got) != 1 || got[0] != "a.txt" {
		t.Fatalf("conflicted = %q", got)
	}
	if list := f.stashes(t); len(list) != 1 {
		t.Fatalf("stash should be kept after a conflict: %+v", list)
	}
}

func TestDropStashRemovesOnlyThatStash(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	f := newFixture(t, r)
	r.Write("a.txt", "first\n")
	f.mustOperate(t, "stash-push", map[string]any{"message": "first"})
	r.Write("a.txt", "second\n")
	f.mustOperate(t, "stash-push", map[string]any{"message": "second"})
	list := f.stashes(t)

	commands := f.mustOperate(t, "stash-drop", map[string]any{"index": 1, "oid": list[1].Oid})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git stash drop 'stash@{1}'" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := f.stashes(t); len(got) != 1 || got[0].Oid != list[0].Oid {
		t.Fatalf("unexpected stash list: %+v", got)
	}
}

func TestStashOperationsRefuseAStashThatChanged(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	f := newFixture(t, r)
	r.Write("a.txt", "first\n")
	f.mustOperate(t, "stash-push", map[string]any{"message": "first"})
	first := f.stashes(t)[0]
	r.Write("a.txt", "second\n")
	f.mustOperate(t, "stash-push", map[string]any{"message": "second"})

	cases := []struct {
		name string
		op   string
		body map[string]any
		want string
	}{
		{"index moved", "stash-drop", map[string]any{"index": 0, "oid": first.Oid}, "no longer the stash you selected"},
		{"index gone", "stash-apply", map[string]any{"index": 5, "oid": first.Oid}, "no stash@{5}"},
		{"negative index", "stash-drop", map[string]any{"index": -1, "oid": first.Oid}, "negative"},
		{"missing oid", "stash-apply", map[string]any{"index": 1}, "missing oid"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			code, response := f.operate(t, c.op, c.body)
			if code != http.StatusBadRequest || response.Error.Code != "invalid_request" ||
				!strings.Contains(response.Error.Message, c.want) {
				t.Fatalf("unexpected response %d: %+v", code, response.Error)
			}
			if len(response.Error.Commands) != 0 {
				t.Fatalf("ran commands: %+v", response.Error.Commands)
			}
		})
	}
	if got := f.stashes(t); len(got) != 2 {
		t.Fatalf("stash list changed: %+v", got)
	}
}

func TestStashRequestErrors(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	f := newFixture(t, r)

	for path, want := range map[string]struct {
		status int
		code   string
	}{
		"/stashes/0":   {http.StatusNotFound, "stash_not_found"},
		"/stashes/abc": {http.StatusBadRequest, "invalid_request"},
		"/stashes/-1":  {http.StatusBadRequest, "invalid_request"},
	} {
		response := f.get(t, "/api/v1/repos/"+f.repoID+path)
		got := decode[apiError](t, response)
		if response.Code != want.status || got.Error.Code != want.code || got.Error.Message == "" {
			t.Errorf("%s: %d %+v", path, response.Code, got.Error)
		}
	}

	response := f.get(t, "/api/v1/repos/"+f.repoID+"/diff?"+stashDiffParams(r.Git("rev-parse", "HEAD"), "a.txt").Encode())
	if got := decode[apiError](t, response); response.Code != http.StatusBadRequest || !strings.Contains(got.Error.Message, "not a stash") {
		t.Errorf("diff of a non-stash commit: %d %+v", response.Code, got.Error)
	}
}
