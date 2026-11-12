package server_test

import (
	"net/http"
	"strings"
	"testing"

	"gitview/internal/gittest"
)

func currentBranch(r *gittest.Repo) string { return r.Git("branch", "--show-current") }

func TestCheckoutSwitchesToALocalBranch(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	r.Git("branch", "feature/login")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "checkout", map[string]any{"branch": "feature/login"})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git switch feature/login" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := currentBranch(r); got != "feature/login" {
		t.Fatalf("current branch = %q", got)
	}
}

func TestCheckoutThatWouldOverwriteLocalChangesExplainsWhy(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "base\n", "base")
	r.Git("switch", "--quiet", "-c", "other")
	r.Commit("a.txt", "other\n", "other")
	r.Git("switch", "--quiet", "main")
	r.Write("a.txt", "local edit\n")
	f := newFixture(t, r)

	code, response := f.operate(t, "checkout", map[string]any{"branch": "other"})

	if code != http.StatusConflict || response.Error.Code != "local_changes" ||
		!strings.Contains(response.Error.Output, "a.txt") ||
		!strings.Contains(response.Error.Output, "commit your changes or stash them") {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if got := currentBranch(r); got != "main" {
		t.Fatalf("current branch = %q", got)
	}
}

func TestCreateBranchAtTheWorkingCopyParentWithoutCheckingItOut(t *testing.T) {
	r := gittest.Init(t)
	head := r.Commit("a.txt", "a\n", "base")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "createBranch", map[string]any{"name": "feature/login"})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git branch feature/login" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("rev-parse", "feature/login"); got != head {
		t.Fatalf("feature/login at %s, want %s", got, head)
	}
	if got := currentBranch(r); got != "main" {
		t.Fatalf("current branch = %q", got)
	}
}

func TestCreateBranchAtAChosenCommitAndCheckItOut(t *testing.T) {
	r := gittest.Init(t)
	base := r.Commit("a.txt", "a\n", "base")
	r.Commit("a.txt", "b\n", "next")
	r.Write("untracked.txt", "kept\n")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "createBranch", map[string]any{"name": "hotfix", "startPoint": base[:10], "checkout": true})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git switch -c hotfix "+base[:10] {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := currentBranch(r); got != "hotfix" {
		t.Fatalf("current branch = %q", got)
	}
	if got := r.Git("rev-parse", "HEAD"); got != base {
		t.Fatalf("HEAD at %s, want %s", got, base)
	}
}

func TestCreateBranchRejectsInvalidAndTakenNames(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	r.Git("branch", "taken")
	f := newFixture(t, r)

	for _, name := range []string{"", "a..b", "has space", "-x", "HEAD", "ends.lock", "feature/", "taken"} {
		code, response := f.operate(t, "createBranch", map[string]any{"name": name})
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" || len(response.Error.Commands) != 0 {
			t.Fatalf("%q: status %d: %+v", name, code, response.Error)
		}
	}
	code, response := f.operate(t, "createBranch", map[string]any{"name": "ok", "startPoint": "-n"})
	if code != http.StatusBadRequest || response.Error.Code != "invalid_request" {
		t.Fatalf("option as start point: status %d: %+v", code, response.Error)
	}
	if got := r.Git("branch", "--format=%(refname:short)"); got != "main\ntaken" {
		t.Fatalf("branches = %q", got)
	}
}

func TestCreateBranchAtAMissingCommitIsReported(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	f := newFixture(t, r)

	for _, checkout := range []bool{false, true} {
		code, response := f.operate(t, "createBranch", map[string]any{"name": "x", "startPoint": "deadbeef", "checkout": checkout})
		if code != http.StatusNotFound || response.Error.Code != "ref_not_found" {
			t.Fatalf("checkout=%v: status %d: %+v", checkout, code, response.Error)
		}
	}
}

func branchNames(r *gittest.Repo) string { return r.Git("branch", "--format=%(refname:short)") }

func TestDeleteBranchesRemovesSeveralMergedBranches(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	r.Git("branch", "done/one")
	r.Git("branch", "done/two")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "deleteBranches", map[string]any{"branches": []string{"done/one", "done/two"}})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git branch -d done/one done/two" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := branchNames(r); got != "main" {
		t.Fatalf("branches = %q", got)
	}
}

func TestDeletingAnUnmergedBranchNeedsForce(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	r.Git("branch", "merged")
	r.Git("switch", "--quiet", "-c", "wip")
	r.Commit("a.txt", "only on wip\n", "wip")
	r.Git("switch", "--quiet", "main")
	f := newFixture(t, r)

	code, response := f.operate(t, "deleteBranches", map[string]any{"branches": []string{"wip", "merged"}})

	if code != http.StatusConflict || response.Error.Code != "branch_not_merged" ||
		!strings.Contains(response.Error.Output, "'wip' is not fully merged") {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if got := branchNames(r); got != "main\nwip" {
		t.Fatalf("the merged branch should be deleted and wip kept; branches = %q", got)
	}

	commands := f.mustOperate(t, "deleteBranches", map[string]any{"branches": []string{"wip"}, "force": true})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git branch -D wip" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := branchNames(r); got != "main" {
		t.Fatalf("branches = %q", got)
	}
}

func TestDeleteBranchesRefusesTheCurrentBranchAndBadRequests(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	f := newFixture(t, r)

	code, response := f.operate(t, "deleteBranches", map[string]any{"branches": []string{"main"}})
	if code == http.StatusOK || !strings.Contains(response.Error.Output, "main") {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	for _, body := range []map[string]any{{}, {"branches": []string{}}, {"branches": []string{"-D"}}} {
		code, response := f.operate(t, "deleteBranches", body)
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" || len(response.Error.Commands) != 0 {
			t.Fatalf("%v: status %d: %+v", body, code, response.Error)
		}
	}
	if got := branchNames(r); got != "main" {
		t.Fatalf("branches = %q", got)
	}
}

func TestRenameBranchIncludingTheCurrentOne(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	r.Git("branch", "feature")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "renameBranch", map[string]any{"branch": "feature", "newName": "feature/login"})
	if got := commandStrings(commands); len(got) != 1 || got[0] != "git branch -m feature feature/login" {
		t.Fatalf("unexpected commands: %q", got)
	}
	f.mustOperate(t, "renameBranch", map[string]any{"branch": "main", "newName": "trunk"})

	if got := branchNames(r); got != "feature/login\ntrunk" {
		t.Fatalf("branches = %q", got)
	}
	if got := currentBranch(r); got != "trunk" {
		t.Fatalf("current branch = %q", got)
	}
}

func TestRenameBranchRejectsInvalidAndTakenNames(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	r.Git("branch", "feature")
	f := newFixture(t, r)

	for _, body := range []map[string]any{
		{"branch": "feature", "newName": "main"},
		{"branch": "feature", "newName": "bad name"},
		{"branch": "feature", "newName": ""},
		{"branch": "", "newName": "x"},
	} {
		code, response := f.operate(t, "renameBranch", body)
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" || len(response.Error.Commands) != 0 {
			t.Fatalf("%v: status %d: %+v", body, code, response.Error)
		}
	}
	if got := branchNames(r); got != "feature\nmain" {
		t.Fatalf("branches = %q", got)
	}
}

// withOrigin adds a bare repository as remote "origin" and pushes main to it.
func withOrigin(t *testing.T, r *gittest.Repo) {
	t.Helper()
	origin := t.TempDir()
	r.Git("init", "--quiet", "--bare", origin)
	r.Git("remote", "add", "origin", origin)
	r.Git("push", "--quiet", "origin", "main")
}

func TestSetUpstreamMakesABranchTrackARemoteBranch(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	withOrigin(t, r)
	r.Git("branch", "feature")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "setUpstream", map[string]any{"branch": "feature", "upstream": "origin/main"})

	if got := commandStrings(commands); len(got) != 1 || got[0] != "git branch --set-upstream-to=origin/main feature" {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("rev-parse", "--abbrev-ref", "feature@{upstream}"); got != "origin/main" {
		t.Fatalf("upstream = %q", got)
	}
}

func TestSetUpstreamToAMissingBranchIsReported(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	withOrigin(t, r)
	f := newFixture(t, r)

	code, response := f.operate(t, "setUpstream", map[string]any{"branch": "main", "upstream": "origin/nope"})
	if code == http.StatusOK || !strings.Contains(response.Error.Output, "origin/nope") {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	for _, body := range []map[string]any{{"branch": "main"}, {"upstream": "origin/main"}, {"branch": "main", "upstream": "-x"}} {
		code, response := f.operate(t, "setUpstream", body)
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" {
			t.Fatalf("%v: status %d: %+v", body, code, response.Error)
		}
	}
}

func TestCheckoutOfAMissingBranchIsReported(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "base")
	f := newFixture(t, r)

	code, response := f.operate(t, "checkout", map[string]any{"branch": "nope"})
	if code != http.StatusNotFound || response.Error.Code != "ref_not_found" {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	for _, branch := range []string{"", "--orphan"} {
		code, response := f.operate(t, "checkout", map[string]any{"branch": branch})
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" || len(response.Error.Commands) != 0 {
			t.Fatalf("%q: status %d: %+v", branch, code, response.Error)
		}
	}
}
