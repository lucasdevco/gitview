package server_test

import (
	"net/http"
	"slices"
	"strings"
	"testing"
)

func TestPullFastForwardsTheCurrentBranch(t *testing.T) {
	s := newRemoteSetup(t)
	newest := s.colleague.Commit("a.txt", "two\n", "second")
	s.colleague.Git("push", "--quiet", "origin", "main")
	f := newFixture(t, s.local)

	done := f.waitJob(t, f.startJob(t, "pull", map[string]any{"remote": "origin", "branch": "main"}).ID)

	if done.State != "succeeded" || done.Error != nil {
		t.Fatalf("pull: %+v", done)
	}
	if got := commandStrings(done.Commands); !slices.Equal(got, []string{"git pull --progress --no-rebase origin main"}) {
		t.Fatalf("commands = %q", got)
	}
	if got := s.local.Git("rev-parse", "HEAD"); got != newest {
		t.Fatalf("HEAD = %s, want %s", got, newest)
	}
}

func TestPullMergesDivergedHistoryWithTheChosenOptions(t *testing.T) {
	s := newRemoteSetup(t)
	theirs := s.colleague.Commit("b.txt", "theirs\n", "their change")
	s.colleague.Git("push", "--quiet", "origin", "main")
	ours := s.local.Commit("c.txt", "ours\n", "our change")
	f := newFixture(t, s.local)

	done := f.waitJob(t, f.startJob(t, "pull", map[string]any{
		"remote": "origin", "branch": "main", "log": true, "noFastForward": true,
	}).ID)

	if done.State != "succeeded" {
		t.Fatalf("pull: %+v", done)
	}
	if got := commandStrings(done.Commands); !slices.Equal(got, []string{"git pull --progress --no-rebase --no-ff --log origin main"}) {
		t.Fatalf("commands = %q", got)
	}
	if parents := s.local.Git("log", "-1", "--format=%P"); parents != ours+" "+theirs {
		t.Fatalf("merge parents = %q, want %s %s", parents, ours, theirs)
	}
	// --log lists the merged commits in the merge commit's message.
	if message := s.local.Git("log", "-1", "--format=%B"); !strings.Contains(message, "their change") {
		t.Fatalf("merge message = %q", message)
	}
}

func TestPullWithoutCommittingLeavesTheMergeInProgress(t *testing.T) {
	s := newRemoteSetup(t)
	s.colleague.Commit("b.txt", "theirs\n", "their change")
	s.colleague.Git("push", "--quiet", "origin", "main")
	ours := s.local.Commit("c.txt", "ours\n", "our change")
	f := newFixture(t, s.local)

	done := f.waitJob(t, f.startJob(t, "pull", map[string]any{"remote": "origin", "branch": "main", "noCommit": true}).ID)

	if done.State != "succeeded" {
		t.Fatalf("pull: %+v", done)
	}
	if got := commandStrings(done.Commands); !slices.Equal(got, []string{"git pull --progress --no-rebase --no-commit origin main"}) {
		t.Fatalf("commands = %q", got)
	}
	if head := s.local.Git("rev-parse", "HEAD"); head != ours {
		t.Fatalf("HEAD moved to %s", head)
	}
	if state := f.repoState(t); state != "merging" {
		t.Fatalf("state = %q, want merging", state)
	}
}

func TestPullWithRebaseReplaysLocalCommitsOnTop(t *testing.T) {
	s := newRemoteSetup(t)
	theirs := s.colleague.Commit("b.txt", "theirs\n", "their change")
	s.colleague.Git("push", "--quiet", "origin", "main")
	s.local.Commit("c.txt", "ours\n", "our change")
	f := newFixture(t, s.local)

	done := f.waitJob(t, f.startJob(t, "pull", map[string]any{"remote": "origin", "branch": "main", "rebase": true}).ID)

	if done.State != "succeeded" {
		t.Fatalf("pull: %+v", done)
	}
	if got := commandStrings(done.Commands); !slices.Equal(got, []string{"git pull --progress --rebase origin main"}) {
		t.Fatalf("commands = %q", got)
	}
	if parent := s.local.Git("rev-parse", "HEAD^"); parent != theirs {
		t.Fatalf("HEAD^ = %s, want their commit %s", parent, theirs)
	}
	if subject := s.local.Git("log", "-1", "--format=%s"); subject != "our change" {
		t.Fatalf("HEAD = %q", subject)
	}
}

func TestPullThatConflictsReportsTheConflict(t *testing.T) {
	s := newRemoteSetup(t)
	s.colleague.Commit("a.txt", "theirs\n", "their change")
	s.colleague.Git("push", "--quiet", "origin", "main")
	s.local.Commit("a.txt", "ours\n", "our change")
	f := newFixture(t, s.local)

	done := f.waitJob(t, f.startJob(t, "pull", map[string]any{"remote": "origin", "branch": "main"}).ID)

	if done.State != "failed" || done.Error == nil || done.Error.Code != "conflict" {
		t.Fatalf("pull: %+v", done)
	}
	if got := f.conflictedPaths(t); !slices.Equal(got, []string{"a.txt"}) {
		t.Fatalf("conflicted = %q", got)
	}
}

func TestFetchIntoFastForwardsABranchThatIsNotCheckedOut(t *testing.T) {
	s := newRemoteSetup(t)
	s.colleague.Git("push", "--quiet", "origin", "main:feature")
	s.local.Git("fetch", "--quiet", "origin")
	s.local.Git("branch", "--quiet", "--track", "feature", "origin/feature")
	s.colleague.Git("switch", "--quiet", "-c", "feature")
	newest := s.colleague.Commit("f.txt", "feature\n", "feature work")
	s.colleague.Git("push", "--quiet", "origin", "feature")
	head := s.local.Git("rev-parse", "HEAD")
	f := newFixture(t, s.local)

	done := f.waitJob(t, f.startJob(t, "fetchInto", map[string]any{"remote": "origin", "branch": "feature", "local": "feature"}).ID)

	if done.State != "succeeded" {
		t.Fatalf("fetchInto: %+v", done)
	}
	if got := commandStrings(done.Commands); !slices.Equal(got, []string{"git fetch --progress origin feature:feature"}) {
		t.Fatalf("commands = %q", got)
	}
	if got := s.local.Git("rev-parse", "feature"); got != newest {
		t.Fatalf("feature = %s, want %s", got, newest)
	}
	if got := s.local.Git("rev-parse", "HEAD"); got != head {
		t.Fatalf("HEAD moved to %s", got)
	}
}

func TestFetchIntoABranchWithItsOwnCommitsIsRefused(t *testing.T) {
	s := newRemoteSetup(t)
	s.colleague.Commit("a.txt", "theirs\n", "their change")
	s.colleague.Git("push", "--quiet", "origin", "main")
	s.local.Commit("b.txt", "ours\n", "our change")
	s.local.Git("switch", "--quiet", "-c", "other")
	f := newFixture(t, s.local)

	done := f.waitJob(t, f.startJob(t, "fetchInto", map[string]any{"remote": "origin", "branch": "main", "local": "main"}).ID)

	if done.State != "failed" || done.Error == nil || done.Error.Code != "git_failed" ||
		!strings.Contains(done.Error.Output, "non-fast-forward") {
		t.Fatalf("fetchInto: %+v", done)
	}
}

func TestPullRequestsAreValidated(t *testing.T) {
	s := newRemoteSetup(t)
	f := newFixture(t, s.local)
	for name, body := range map[string]map[string]any{
		"rebase with merge options": {"remote": "origin", "branch": "main", "rebase": true, "noFastForward": true},
		"branch without remote":     {"branch": "main"},
		"option as remote":          {"remote": "--upload-pack=evil", "branch": "main"},
		"option as branch":          {"remote": "origin", "branch": "-x"},
	} {
		t.Run(name, func(t *testing.T) {
			response := f.post(t, "/api/v1/repos/"+f.repoID+"/operations/pull", body)
			if response.Code != http.StatusBadRequest || decode[jobResponse](t, response).Error.Code != "invalid_request" {
				t.Fatalf("status %d: %s", response.Code, response.Body)
			}
		})
	}
}
