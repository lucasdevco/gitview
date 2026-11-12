package server_test

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"gitview/internal/gittest"
)

// numbered returns lines "line 1".."line n", replacing the given line
// numbers with other text.
func numbered(n int, replace map[int]string) string {
	var b strings.Builder
	for i := 1; i <= n; i++ {
		if text, ok := replace[i]; ok {
			b.WriteString(text + "\n")
			continue
		}
		fmt.Fprintf(&b, "line %d\n", i)
	}
	return b.String()
}

func readFile(t *testing.T, r *gittest.Repo, path string) string {
	t.Helper()
	content, err := os.ReadFile(filepath.Join(r.Dir, path))
	if err != nil {
		t.Fatal(err)
	}
	return string(content)
}

type hunkRange struct {
	OldStart int `json:"oldStart"`
	OldCount int `json:"oldCount"`
	NewStart int `json:"newStart"`
	NewCount int `json:"newCount"`
}

// The two hunks of a 20-line file whose lines 2 and 18 changed.
var (
	firstHunk  = hunkRange{OldStart: 1, OldCount: 5, NewStart: 1, NewCount: 5}
	secondHunk = hunkRange{OldStart: 15, OldCount: 6, NewStart: 15, NewCount: 6}
)

// twoHunkRepo commits a 20-line file and changes lines 2 and 18 in the
// working tree, giving two separate hunks.
func twoHunkRepo(t *testing.T) *gittest.Repo {
	r := gittest.Init(t)
	r.Commit("f.txt", numbered(20, nil), "base")
	r.Write("f.txt", numbered(20, map[int]string{2: "changed 2", 18: "changed 18"}))
	return r
}

func TestStageHunkStagesOnlyThatHunk(t *testing.T) {
	r := twoHunkRepo(t)
	f := newFixture(t, r)

	commands := f.mustOperate(t, "stageHunk", map[string]any{"path": "f.txt", "hunk": secondHunk})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git apply --cached" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got, want := r.Git("show", ":f.txt"), strings.TrimSpace(numbered(20, map[int]string{18: "changed 18"})); got != want {
		t.Fatalf("index content:\n%s", got)
	}
	if got, want := r.Git("diff", "--name-only"), "f.txt"; got != want {
		t.Fatalf("the other hunk should stay unstaged; unstaged files = %q", got)
	}
	if got := r.Git("diff", "-U0"); !strings.Contains(got, "+changed 2") || strings.Contains(got, "changed 18") {
		t.Fatalf("unstaged diff:\n%s", got)
	}
}

func TestUnstageHunkUnstagesOnlyThatHunk(t *testing.T) {
	r := twoHunkRepo(t)
	r.Git("add", "f.txt")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "unstageHunk", map[string]any{"path": "f.txt", "hunk": firstHunk})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git apply --cached -R" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got, want := r.Git("show", ":f.txt"), strings.TrimSpace(numbered(20, map[int]string{18: "changed 18"})); got != want {
		t.Fatalf("index content:\n%s", got)
	}
	want := numbered(20, map[int]string{2: "changed 2", 18: "changed 18"})
	if got := readFile(t, r, "f.txt"); got != want {
		t.Fatalf("working tree must not change:\n%s", got)
	}
}

func TestDiscardHunkRevertsOnlyThatHunkInTheWorkingTree(t *testing.T) {
	r := twoHunkRepo(t)
	f := newFixture(t, r)

	commands := f.mustOperate(t, "discardHunk", map[string]any{"path": "f.txt", "hunk": firstHunk})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git apply -R" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got, want := readFile(t, r, "f.txt"), numbered(20, map[int]string{18: "changed 18"}); got != want {
		t.Fatalf("working tree:\n%s", got)
	}
	if got := r.Git("diff", "--cached", "--name-only"); got != "" {
		t.Fatalf("index must not change; staged = %q", got)
	}
}

func TestDiscardHunkKeepsStagedChangesOfTheSameFile(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("f.txt", numbered(20, nil), "base")
	r.Write("f.txt", numbered(20, map[int]string{2: "staged 2"}))
	r.Git("add", "f.txt")
	r.Write("f.txt", numbered(20, map[int]string{2: "staged 2", 18: "changed 18"}))
	f := newFixture(t, r)

	f.mustOperate(t, "discardHunk", map[string]any{"path": "f.txt", "hunk": secondHunk})

	staged := numbered(20, map[int]string{2: "staged 2"})
	if got := readFile(t, r, "f.txt"); got != staged {
		t.Fatalf("working tree:\n%s", got)
	}
	if got := r.Git("show", ":f.txt"); got != strings.TrimSpace(staged) {
		t.Fatalf("index content:\n%s", got)
	}
}

func TestHunkOperationsHandleAMissingFinalNewline(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("f.txt", strings.TrimSuffix(numbered(20, nil), "\n"), "base")
	r.Write("f.txt", numbered(20, map[int]string{2: "changed 2", 20: "changed 20"}))
	f := newFixture(t, r)

	f.mustOperate(t, "stageHunk", map[string]any{"path": "f.txt",
		"hunk": hunkRange{OldStart: 17, OldCount: 4, NewStart: 17, NewCount: 4}})

	want := numbered(20, map[int]string{20: "changed 20"})
	if got := r.Git("cat-file", "blob", ":f.txt"); got+"\n" != want {
		t.Fatalf("index content:\n%q", got)
	}
	if r.Git("diff", "--cached", "--stat") == "" {
		t.Fatal("nothing staged")
	}
}

func TestStageHunkOfAnUntrackedFileAddsIt(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("base.txt", "base\n", "base")
	r.Write("new.txt", "one\ntwo\n")
	f := newFixture(t, r)

	f.mustOperate(t, "stageHunk", map[string]any{"path": "new.txt",
		"hunk": hunkRange{OldStart: 0, OldCount: 0, NewStart: 1, NewCount: 2}})

	status := f.status(t)
	if got := paths(status.Staged); strings.Join(got, ",") != "new.txt" || status.Staged[0].Status != "added" {
		t.Fatalf("staged = %+v", status.Staged)
	}
	if len(status.Untracked)+len(status.Unstaged) != 0 {
		t.Fatalf("unexpected status: %+v", status)
	}
}

func TestDiscardHunkOfAnUntrackedFileDeletesIt(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("base.txt", "base\n", "base")
	r.Write("new.txt", "one\ntwo\n")
	f := newFixture(t, r)

	f.mustOperate(t, "discardHunk", map[string]any{"path": "new.txt",
		"hunk": hunkRange{OldStart: 0, OldCount: 0, NewStart: 1, NewCount: 2}})

	if status := f.status(t); len(status.Untracked) != 0 {
		t.Fatalf("untracked = %+v", status.Untracked)
	}
}

func TestUnstageHunkOfARenamedFileKeepsTheRename(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("old.txt", numbered(20, nil), "base")
	r.Git("mv", "old.txt", "new.txt")
	r.Write("new.txt", numbered(20, map[int]string{2: "changed 2", 18: "changed 18"}))
	r.Git("add", "new.txt")
	f := newFixture(t, r)

	f.mustOperate(t, "unstageHunk", map[string]any{"path": "new.txt", "oldPath": "old.txt", "hunk": secondHunk})

	if got, want := r.Git("show", ":new.txt"), strings.TrimSpace(numbered(20, map[int]string{2: "changed 2"})); got != want {
		t.Fatalf("index content:\n%s", got)
	}
	status := f.status(t)
	if len(status.Staged) != 1 || status.Staged[0].Status != "renamed" || status.Staged[0].OldPath != "old.txt" {
		t.Fatalf("staged = %+v", status.Staged)
	}
}

func TestUnstageHunkOfARenameWithQuotedNamesAndHeaderLikeLines(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("旧 文件.sql", numbered(20, map[int]string{2: "-- a comment", 18: "++ counter"}), "base")
	r.Git("mv", "旧 文件.sql", "新 文件.sql")
	r.Write("新 文件.sql", numbered(20, nil))
	r.Git("add", "新 文件.sql")
	f := newFixture(t, r)

	f.mustOperate(t, "unstageHunk", map[string]any{"path": "新 文件.sql", "oldPath": "旧 文件.sql", "hunk": firstHunk})

	if got, want := r.Git("show", ":新 文件.sql"), strings.TrimSpace(numbered(20, map[int]string{2: "-- a comment"})); got != want {
		t.Fatalf("index content:\n%s", got)
	}
	if status := f.status(t); len(status.Staged) != 1 || status.Staged[0].Status != "renamed" {
		t.Fatalf("staged = %+v", status.Staged)
	}
}

func TestHunkThatNoLongerMatchesIsRejectedWithoutChanges(t *testing.T) {
	r := twoHunkRepo(t)
	f := newFixture(t, r)

	stale := hunkRange{OldStart: 8, OldCount: 5, NewStart: 8, NewCount: 5}
	for _, op := range []string{"stageHunk", "discardHunk", "unstageHunk"} {
		code, response := f.operate(t, op, map[string]any{"path": "f.txt", "hunk": stale})
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" ||
			!strings.Contains(response.Error.Message, "refresh") || len(response.Error.Commands) != 0 {
			t.Fatalf("%s: status %d: %+v", op, code, response.Error)
		}
	}
	if got := readFile(t, r, "f.txt"); got != numbered(20, map[int]string{2: "changed 2", 18: "changed 18"}) {
		t.Fatalf("working tree changed:\n%s", got)
	}
	if got := r.Git("diff", "--cached", "--name-only"); got != "" {
		t.Fatalf("index changed: %q", got)
	}
}

func TestHunkRequestsAreValidated(t *testing.T) {
	r := twoHunkRepo(t)
	f := newFixture(t, r)

	for name, body := range map[string]map[string]any{
		"missing path":   {"hunk": firstHunk},
		"outside repo":   {"path": "../f.txt", "hunk": firstHunk},
		"missing hunk":   {"path": "f.txt"},
		"negative start": {"path": "f.txt", "hunk": hunkRange{OldStart: -1, NewStart: 1, NewCount: 1}},
	} {
		code, response := f.operate(t, "stageHunk", body)
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" {
			t.Fatalf("%s: status %d: %+v", name, code, response.Error)
		}
	}
}

func TestHunkOperationsRefuseConflictedFiles(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("f.txt", "base\n", "base")
	r.Git("checkout", "--quiet", "-b", "other")
	r.Commit("f.txt", "theirs\n", "theirs")
	r.Git("checkout", "--quiet", "main")
	r.Commit("f.txt", "ours\n", "ours")
	r.GitFails("merge", "other")
	f := newFixture(t, r)

	code, response := f.operate(t, "stageHunk", map[string]any{"path": "f.txt",
		"hunk": hunkRange{OldStart: 1, OldCount: 1, NewStart: 1, NewCount: 5}})

	if code != http.StatusBadRequest || !strings.Contains(response.Error.Message, "conflict") {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
}
