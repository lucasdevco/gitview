package server_test

import (
	"net/http"
	"reflect"
	"strings"
	"testing"

	"gitview/internal/gittest"
)

// repoState reads the in-progress state the repository summary reports.
func (f fixture) repoState(t *testing.T) string {
	t.Helper()
	response := f.get(t, "/api/v1/repos/"+f.repoID)
	if response.Code != http.StatusOK {
		t.Fatalf("summary: status %d: %s", response.Code, response.Body)
	}
	return decode[struct {
		Data struct {
			State string `json:"state"`
		} `json:"data"`
	}](t, response).Data.State
}

// conflictedPaths lists the paths the status endpoint reports as conflicted.
func (f fixture) conflictedPaths(t *testing.T) []string {
	t.Helper()
	response := f.get(t, "/api/v1/repos/"+f.repoID+"/status")
	if response.Code != http.StatusOK {
		t.Fatalf("status: status %d: %s", response.Code, response.Body)
	}
	return paths(decode[struct {
		Data worktreeStatus `json:"data"`
	}](t, response).Data.Conflicted)
}

// divergedBranches builds main and topic, which both change a.txt, so
// merging or rebasing one onto the other stops on a conflict.
func divergedBranches(t *testing.T) *gittest.Repo {
	r := gittest.Init(t)
	r.Commit("a.txt", "base\n", "base")
	r.Git("branch", "topic")
	r.Commit("a.txt", "main\n", "main change")
	r.Git("switch", "--quiet", "topic")
	r.Commit("a.txt", "topic\n", "topic change")
	r.Git("switch", "--quiet", "main")
	return r
}

func TestMergeFastForwardsWhenPossible(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "base\n", "base")
	r.Git("switch", "--quiet", "-c", "topic")
	tip := r.Commit("b.txt", "topic\n", "topic change")
	r.Git("switch", "--quiet", "main")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "merge", map[string]any{"branch": "topic"})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git merge topic"}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("rev-parse", "main"); got != tip {
		t.Fatalf("main at %s, want fast-forward to %s", got, tip)
	}
	if got := f.repoState(t); got != "clean" {
		t.Fatalf("state = %q, want clean", got)
	}
}

func TestMergeCanAlwaysCreateAMergeCommitListingTheMergedCommits(t *testing.T) {
	r := gittest.Init(t)
	base := r.Commit("a.txt", "base\n", "base")
	r.Git("switch", "--quiet", "-c", "topic")
	tip := r.Commit("b.txt", "topic\n", "Add b")
	r.Git("switch", "--quiet", "main")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "merge", map[string]any{"branch": "topic", "noFastForward": true, "log": true})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git merge --no-ff --log topic"}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("rev-parse", "HEAD^1", "HEAD^2"); got != base+"\n"+tip {
		t.Fatalf("merge commit parents = %q, want %s and %s", got, base, tip)
	}
	message := r.Git("log", "-1", "--format=%B")
	if !strings.HasPrefix(message, "Merge branch 'topic'") || !strings.Contains(message, "Add b") {
		t.Fatalf("merge message = %q, want the merged commit's subject listed", message)
	}
}

func TestMergeWithoutCommittingLeavesTheMergeInProgress(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "base\n", "base")
	r.Git("switch", "--quiet", "-c", "topic")
	r.Commit("b.txt", "topic\n", "Add b")
	r.Git("switch", "--quiet", "main")
	head := r.Commit("c.txt", "main\n", "Add c")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "merge", map[string]any{"branch": "topic", "noCommit": true})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git merge --no-commit topic"}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("rev-parse", "HEAD"); got != head {
		t.Fatalf("HEAD moved to %s; --no-commit should not commit", got)
	}
	if got := f.repoState(t); got != "merging" {
		t.Fatalf("state = %q, want merging", got)
	}
}

func TestMergeConflictLeavesTheRepositoryMergingWithConflictedFiles(t *testing.T) {
	r := divergedBranches(t)
	f := newFixture(t, r)

	code, response := f.operate(t, "merge", map[string]any{"branch": "topic"})

	if code != http.StatusConflict || response.Error.Code != "conflict" ||
		!strings.Contains(response.Error.Output, "CONFLICT (content): Merge conflict in a.txt") {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if got := commandStrings(response.Error.Commands); !reflect.DeepEqual(got, []string{"git merge topic"}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := f.repoState(t); got != "merging" {
		t.Fatalf("state = %q, want merging", got)
	}
	if got := f.conflictedPaths(t); !reflect.DeepEqual(got, []string{"a.txt"}) {
		t.Fatalf("conflicted = %q, want [a.txt]", got)
	}
}

func TestAbortMergeRestoresTheStateBeforeTheMerge(t *testing.T) {
	r := divergedBranches(t)
	head := r.Git("rev-parse", "HEAD")
	f := newFixture(t, r)
	f.operate(t, "merge", map[string]any{"branch": "topic"})

	commands := f.mustOperate(t, "abortMerge", map[string]any{})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git merge --abort"}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := f.repoState(t); got != "clean" {
		t.Fatalf("state = %q, want clean", got)
	}
	if got := f.conflictedPaths(t); len(got) != 0 {
		t.Fatalf("conflicted = %q, want none", got)
	}
	if got := r.Git("rev-parse", "HEAD"); got != head {
		t.Fatalf("HEAD = %s, want %s", got, head)
	}
	if got := r.Git("show", ":a.txt"); got != "main" {
		t.Fatalf("a.txt in the index = %q, want main's version", got)
	}
}

func TestAbortMergeWithoutAMergeInProgressSaysSo(t *testing.T) {
	f := newFixture(t, divergedBranches(t))

	code, response := f.operate(t, "abortMerge", map[string]any{})

	if code != http.StatusConflict || response.Error.Code != "nothing_in_progress" {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
}

func TestStagingAConflictedFileMarksItResolvedSoTheMergeCanBeCommitted(t *testing.T) {
	r := divergedBranches(t)
	f := newFixture(t, r)
	f.operate(t, "merge", map[string]any{"branch": "topic"})
	r.Write("a.txt", "main and topic\n")

	f.mustOperate(t, "stage", map[string]any{"paths": []string{"a.txt"}})

	if got := f.conflictedPaths(t); len(got) != 0 {
		t.Fatalf("conflicted = %q, want none after staging", got)
	}
	f.mustOperate(t, "commit", map[string]any{"message": "Merge topic"})
	if got := f.repoState(t); got != "clean" {
		t.Fatalf("state = %q, want clean after committing the merge", got)
	}
	if got := r.Git("rev-list", "--count", "--merges", "HEAD"); got != "1" {
		t.Fatalf("merge commits = %s, want 1", got)
	}
}

func TestRebaseReplaysTheCurrentBranchOntoAnother(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "base\n", "base")
	r.Git("switch", "--quiet", "-c", "topic")
	tip := r.Commit("b.txt", "topic\n", "Add b")
	r.Git("switch", "--quiet", "main")
	r.Commit("c.txt", "main\n", "Add c")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "rebase", map[string]any{"onto": "topic"})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git rebase topic"}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("rev-parse", "HEAD~1"); got != tip {
		t.Fatalf("HEAD~1 = %s, want main's commit replayed on topic (%s)", got, tip)
	}
	if got := r.Git("log", "-1", "--format=%s"); got != "Add c" {
		t.Fatalf("HEAD subject = %q", got)
	}
	if got := currentBranch(r); got != "main" {
		t.Fatalf("current branch = %q", got)
	}
}

func TestRebaseConflictLeavesTheRepositoryRebasingUntilAborted(t *testing.T) {
	r := divergedBranches(t)
	head := r.Git("rev-parse", "HEAD")
	f := newFixture(t, r)

	code, response := f.operate(t, "rebase", map[string]any{"onto": "topic"})

	if code != http.StatusConflict || response.Error.Code != "conflict" {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if got := f.repoState(t); got != "rebasing" {
		t.Fatalf("state = %q, want rebasing", got)
	}
	if got := f.conflictedPaths(t); !reflect.DeepEqual(got, []string{"a.txt"}) {
		t.Fatalf("conflicted = %q, want [a.txt]", got)
	}

	commands := f.mustOperate(t, "abortRebase", map[string]any{})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git rebase --abort"}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := f.repoState(t); got != "clean" {
		t.Fatalf("state = %q, want clean", got)
	}
	if got := r.Git("rev-parse", "HEAD"); got != head || currentBranch(r) != "main" {
		t.Fatalf("HEAD = %s on %q, want %s on main", got, currentBranch(r), head)
	}
}

func TestRebaseWithLocalChangesExplainsWhy(t *testing.T) {
	r := divergedBranches(t)
	r.Write("a.txt", "local edit\n")
	f := newFixture(t, r)

	code, response := f.operate(t, "rebase", map[string]any{"onto": "topic"})

	if code != http.StatusConflict || response.Error.Code != "local_changes" {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if got := f.repoState(t); got != "clean" {
		t.Fatalf("state = %q, want clean", got)
	}
}

func TestAbortRebaseWithoutARebaseInProgressSaysSo(t *testing.T) {
	f := newFixture(t, divergedBranches(t))

	code, response := f.operate(t, "abortRebase", map[string]any{})

	if code != http.StatusConflict || response.Error.Code != "nothing_in_progress" {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
}

func TestMergeThatWouldOverwriteLocalChangesExplainsWhy(t *testing.T) {
	r := divergedBranches(t)
	r.Write("a.txt", "local edit\n")
	f := newFixture(t, r)

	code, response := f.operate(t, "merge", map[string]any{"branch": "topic"})

	if code != http.StatusConflict || response.Error.Code != "local_changes" || !strings.Contains(response.Error.Output, "a.txt") {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if got := f.repoState(t); got != "clean" {
		t.Fatalf("state = %q, want clean", got)
	}
}

func TestMergeRejectsAMissingOrOptionLikeBranch(t *testing.T) {
	f := newFixture(t, divergedBranches(t))
	for _, branch := range []string{"", "--abort"} {
		code, response := f.operate(t, "merge", map[string]any{"branch": branch})
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" || len(response.Error.Commands) != 0 {
			t.Fatalf("merge %q: status %d: %+v", branch, code, response.Error)
		}
		code, response = f.operate(t, "rebase", map[string]any{"onto": branch})
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" || len(response.Error.Commands) != 0 {
			t.Fatalf("rebase %q: status %d: %+v", branch, code, response.Error)
		}
	}
}
