package server_test

import (
	"net/http"
	"slices"
	"strings"
	"testing"
)

func TestPushSendsTheCurrentBranchToItsRemoteBranch(t *testing.T) {
	s := newRemoteSetup(t)
	tip := s.local.Commit("a.txt", "two\n", "second")
	f := newFixture(t, s.local)

	done := f.waitJob(t, f.startJob(t, "push", map[string]any{
		"remote":   "origin",
		"branches": []map[string]any{{"local": "main", "remote": "main", "track": true}},
	}).ID)

	if done.State != "succeeded" || done.Error != nil {
		t.Fatalf("push: %+v", done)
	}
	if got := commandStrings(done.Commands); !slices.Equal(got, []string{"git push --progress -u origin main:main"}) {
		t.Fatalf("commands = %q", got)
	}
	if got := s.origin.Git("rev-parse", "main"); got != tip {
		t.Fatalf("origin main = %s, want %s", got, tip)
	}
	if refs := f.refs(t); refs.Branches[0].Ahead != 0 {
		t.Fatalf("still ahead after push: %+v", refs.Branches)
	}
}

func TestPushSeveralBranchesTrackingOnlyTheChosenOnesWithTags(t *testing.T) {
	s := newRemoteSetup(t)
	s.local.Git("branch", "feature")
	s.local.Git("branch", "docs")
	s.local.Git("tag", "v1")
	f := newFixture(t, s.local)

	done := f.waitJob(t, f.startJob(t, "push", map[string]any{
		"remote": "origin",
		"branches": []map[string]any{
			{"local": "feature", "remote": "feature", "track": true},
			{"local": "docs", "remote": "published-docs"},
		},
		"tags": true,
	}).ID)

	if done.State != "succeeded" {
		t.Fatalf("push: %+v", done)
	}
	want := []string{
		"git push --progress -u --tags origin feature:feature",
		"git push --progress origin docs:published-docs",
	}
	if got := commandStrings(done.Commands); !slices.Equal(got, want) {
		t.Fatalf("commands = %q, want %q", got, want)
	}
	if got := s.origin.Git("for-each-ref", "--format=%(refname)"); !strings.Contains(got, "refs/heads/feature") ||
		!strings.Contains(got, "refs/heads/published-docs") || !strings.Contains(got, "refs/tags/v1") {
		t.Fatalf("origin refs = %q", got)
	}
	if got := s.local.Git("rev-parse", "--abbrev-ref", "feature@{upstream}"); got != "origin/feature" {
		t.Fatalf("feature tracks %q", got)
	}
	if got := s.local.Git("config", "--default", "", "branch.docs.remote"); got != "" {
		t.Fatalf("docs tracks %q, want nothing", got)
	}
}

func TestPushOnlyTags(t *testing.T) {
	s := newRemoteSetup(t)
	s.local.Git("tag", "v2")
	f := newFixture(t, s.local)

	done := f.waitJob(t, f.startJob(t, "push", map[string]any{"remote": "origin", "tags": true}).ID)

	if got := commandStrings(done.Commands); done.State != "succeeded" || !slices.Equal(got, []string{"git push --progress --tags origin"}) {
		t.Fatalf("push: %+v", done)
	}
	if got := s.origin.Git("tag"); got != "v2" {
		t.Fatalf("origin tags = %q", got)
	}
}

func TestRejectedPushExplainsThatTheRemoteHasNewCommits(t *testing.T) {
	s := newRemoteSetup(t)
	theirs := s.colleague.Commit("a.txt", "theirs\n", "their change")
	s.colleague.Git("push", "--quiet", "origin", "main")
	s.local.Commit("b.txt", "ours\n", "our change")
	f := newFixture(t, s.local)

	done := f.waitJob(t, f.startJob(t, "push", map[string]any{
		"remote":   "origin",
		"branches": []map[string]any{{"local": "main", "remote": "main"}},
	}).ID)

	if done.State != "failed" || done.Error == nil || done.Error.Code != "push_rejected" {
		t.Fatalf("push: %+v", done)
	}
	if !strings.Contains(done.Error.Output, "[rejected]") || !strings.Contains(done.Error.Hint, "pull") {
		t.Fatalf("error = %+v, want git's output and advice to pull first", done.Error)
	}
	if got := s.origin.Git("rev-parse", "main"); got != theirs {
		t.Fatalf("origin main = %s, want it unchanged at %s", got, theirs)
	}
}

func TestPushRequestsAreValidated(t *testing.T) {
	s := newRemoteSetup(t)
	f := newFixture(t, s.local)
	for name, body := range map[string]map[string]any{
		"nothing to push":   {"remote": "origin"},
		"missing remote":    {"branches": []map[string]any{{"local": "main"}}},
		"option as remote":  {"remote": "--receive-pack=evil", "branches": []map[string]any{{"local": "main"}}},
		"option as branch":  {"remote": "origin", "branches": []map[string]any{{"local": "-f"}}},
		"refspec as branch": {"remote": "origin", "branches": []map[string]any{{"local": "+main"}}},
		"missing local":     {"remote": "origin", "branches": []map[string]any{{"remote": "main"}}},
	} {
		t.Run(name, func(t *testing.T) {
			response := f.post(t, "/api/v1/repos/"+f.repoID+"/operations/push", body)
			if response.Code != http.StatusBadRequest || decode[jobResponse](t, response).Error.Code != "invalid_request" {
				t.Fatalf("status %d: %s", response.Code, response.Body)
			}
		})
	}
}
