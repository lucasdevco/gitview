package server_test

import (
	"net/http"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"gitview/internal/gittest"
)

type graphCommit struct {
	Oid        string   `json:"oid"`
	Parents    []string `json:"parents"`
	Author     string   `json:"author"`
	Email      string   `json:"email"`
	AuthorTime int64    `json:"authorTime"`
	CommitTime int64    `json:"commitTime"`
	Subject    string   `json:"subject"`
}

// historyRepo is a repository with a merged feature branch, an unmerged topic
// branch and a commit reachable only from a remote-tracking branch.
type historyRepo struct {
	*gittest.Repo
	root, second, feature, merge, topic, remoteOnly string
}

func newHistoryRepo(t *testing.T) historyRepo {
	t.Helper()
	r := gittest.Init(t)
	h := historyRepo{Repo: r}
	h.root = r.Commit("a.txt", "one\n", "root commit")
	r.Git("checkout", "--quiet", "-b", "feature/login")
	h.feature = r.Commit("login.txt", "login\n", "add login")
	r.Git("checkout", "--quiet", "main")
	h.second = r.Commit("a.txt", "two\n", "second on main")
	r.Git("merge", "--quiet", "--no-ff", "-m", "Merge branch 'feature/login'", "feature/login")
	h.merge = r.Git("rev-parse", "HEAD")
	r.Git("checkout", "--quiet", "-b", "topic")
	h.topic = r.Commit("topic.txt", "topic\n", "topic work")
	r.Git("checkout", "--quiet", "main")
	h.remoteOnly = r.Git("commit-tree", "-p", h.merge, "-m", "only on the remote", h.merge+"^{tree}")
	r.Git("update-ref", "refs/remotes/origin/experiment", h.remoteOnly)
	return h
}

func (f fixture) graph(t *testing.T, query string) []graphCommit {
	t.Helper()
	response := f.get(t, "/api/v1/repos/"+f.repoID+"/graph"+query)
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	return decode[struct{ Data []graphCommit }](t, response).Data
}

func oids(commits []graphCommit) []string {
	result := make([]string, len(commits))
	for i, c := range commits {
		result[i] = c.Oid
	}
	return result
}

// assertChildrenFirst checks the order the graph layout depends on: every
// commit is listed before all of its parents.
func assertChildrenFirst(t *testing.T, commits []graphCommit) {
	t.Helper()
	position := map[string]int{}
	for i, c := range commits {
		position[c.Oid] = i
	}
	for i, c := range commits {
		for _, parent := range c.Parents {
			if at, ok := position[parent]; ok && at < i {
				t.Fatalf("parent %s listed before its child %s", parent, c.Oid)
			}
		}
	}
}

func sameSet(got, want []string) bool {
	got, want = slices.Clone(got), slices.Clone(want)
	slices.Sort(got)
	slices.Sort(want)
	return slices.Equal(got, want)
}

func TestGraphOfAllBranches(t *testing.T) {
	h := newHistoryRepo(t)
	f := newFixture(t, h.Repo)

	commits := f.graph(t, "")
	want := []string{h.root, h.second, h.feature, h.merge, h.topic, h.remoteOnly}
	if !sameSet(oids(commits), want) {
		t.Fatalf("graph oids = %v, want %v", oids(commits), want)
	}
	assertChildrenFirst(t, commits)

	when, _ := time.Parse(time.RFC3339, "2026-01-02T10:00:00Z")
	for _, c := range commits {
		if c.Oid != h.merge {
			continue
		}
		if !slices.Equal(c.Parents, []string{h.second, h.feature}) {
			t.Fatalf("merge parents = %v, want first parent %s then %s", c.Parents, h.second, h.feature)
		}
		if c.Subject != "Merge branch 'feature/login'" || c.Author != "Ada Lovelace" || c.Email != "ada@example.com" ||
			c.AuthorTime != when.Unix() || c.CommitTime != when.Unix() {
			t.Fatalf("unexpected merge commit metadata: %+v", c)
		}
	}
	if explicit := f.graph(t, "?scope=all&remotes=true"); !slices.Equal(oids(explicit), oids(commits)) {
		t.Fatalf("explicit defaults differ: %v vs %v", oids(explicit), oids(commits))
	}
}

func TestGraphRootCommitHasNoParents(t *testing.T) {
	h := newHistoryRepo(t)
	f := newFixture(t, h.Repo)

	for _, c := range f.graph(t, "") {
		if c.Oid == h.root && (c.Parents == nil || len(c.Parents) != 0) {
			t.Fatalf("root commit parents should be an empty list, got %#v", c.Parents)
		}
	}
}

func TestGraphOfCurrentBranch(t *testing.T) {
	h := newHistoryRepo(t)
	f := newFixture(t, h.Repo)

	commits := f.graph(t, "?scope=current")
	if !sameSet(oids(commits), []string{h.root, h.second, h.feature, h.merge}) {
		t.Fatalf("current-branch graph = %v", oids(commits))
	}
	assertChildrenFirst(t, commits)
}

func TestGraphWithoutRemoteBranches(t *testing.T) {
	h := newHistoryRepo(t)
	f := newFixture(t, h.Repo)

	commits := f.graph(t, "?remotes=false")
	if !sameSet(oids(commits), []string{h.root, h.second, h.feature, h.merge, h.topic}) {
		t.Fatalf("local-only graph = %v", oids(commits))
	}
}

func TestGraphIncludesDetachedHead(t *testing.T) {
	h := newHistoryRepo(t)
	h.Git("checkout", "--quiet", "--detach", h.feature)
	detached := h.Commit("detached.txt", "x\n", "detached work")
	f := newFixture(t, h.Repo)

	if !slices.Contains(oids(f.graph(t, "?remotes=false")), detached) {
		t.Fatal("all-branches graph must include a detached HEAD commit")
	}
	current := f.graph(t, "?scope=current")
	if !sameSet(oids(current), []string{detached, h.feature, h.root}) {
		t.Fatalf("current graph on detached HEAD = %v", oids(current))
	}
}

func TestGraphOfEmptyRepository(t *testing.T) {
	f := newFixture(t, gittest.Init(t))

	for _, query := range []string{"", "?scope=current", "?remotes=false"} {
		response := f.get(t, "/api/v1/repos/"+f.repoID+"/graph"+query)
		if response.Code != http.StatusOK || response.Body.String() != "{\"data\":[]}\n" {
			t.Fatalf("graph%s of empty repository: %d %s", query, response.Code, response.Body)
		}
	}
}

func TestSearchFindsCommitsByTheirFullMessage(t *testing.T) {
	h := newHistoryRepo(t)
	h.Write("b.txt", "b\n")
	h.Git("add", "b.txt")
	h.Git("commit", "--quiet", "-m", "Tidy up", "-m", "Also fixes the Pineapple [crash] in login.")
	body := h.Git("rev-parse", "HEAD")
	f := newFixture(t, h.Repo)

	search := func(query string) []string {
		t.Helper()
		response := f.get(t, "/api/v1/repos/"+f.repoID+"/search"+query)
		if response.Code != http.StatusOK {
			t.Fatalf("search%s: status %d: %s", query, response.Code, response.Body)
		}
		return decode[struct{ Data []string }](t, response).Data
	}
	// Case-insensitive and literal: "[crash]" is not a character class.
	if got := search("?q=pineapple+%5Bcrash%5D"); !slices.Equal(got, []string{body}) {
		t.Fatalf("body match = %q, want %s", got, body)
	}
	if got := search("?q=LOGIN"); !slices.Contains(got, h.feature) || !slices.Contains(got, body) || slices.Contains(got, h.root) {
		t.Fatalf("subject and body matches = %q", got)
	}
	// The same scope options as the graph.
	if got := search("?q=only+on+the+remote&remotes=false"); len(got) != 0 {
		t.Fatalf("remote-only commit found without remotes: %q", got)
	}
	if got := search("?q=only+on+the+remote"); !slices.Equal(got, []string{h.remoteOnly}) {
		t.Fatalf("remote-only commit = %q", got)
	}
	if response := f.get(t, "/api/v1/repos/"+f.repoID+"/search"); response.Code != http.StatusBadRequest {
		t.Fatalf("search without q: status %d", response.Code)
	}
}

func TestSubmodulesAreListedWithTheirRecordedCommit(t *testing.T) {
	library := gittest.Init(t)
	pinned := library.Commit("lib.txt", "v1\n", "library v1")
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "first")
	f := newFixture(t, r)

	type submodule struct {
		Path string `json:"path"`
		Oid  string `json:"oid"`
	}
	list := func() []submodule {
		t.Helper()
		response := f.get(t, "/api/v1/repos/"+f.repoID+"/submodules")
		if response.Code != http.StatusOK {
			t.Fatalf("submodules: status %d: %s", response.Code, response.Body)
		}
		return decode[struct{ Data []submodule }](t, response).Data
	}
	if got := list(); got == nil || len(got) != 0 {
		t.Fatalf("without submodules: %+v, want []", got)
	}

	r.Git("-c", "protocol.file.allow=always", "submodule", "--quiet", "add", library.Dir, "libs/my lib")
	r.Git("commit", "--quiet", "-m", "add library")
	library.Commit("lib.txt", "v2\n", "library v2")

	if got := list(); !slices.Equal(got, []submodule{{Path: "libs/my lib", Oid: pinned}}) {
		t.Fatalf("submodules = %+v, want libs/my lib at %s", got, pinned)
	}
}

func TestGraphRejectsUnknownOptions(t *testing.T) {
	f := newFixture(t, gittest.Init(t))

	for _, query := range []string{"?scope=everything", "?remotes=maybe"} {
		response := f.get(t, "/api/v1/repos/"+f.repoID+"/graph"+query)
		body := decode[apiError](t, response)
		if response.Code != http.StatusBadRequest || body.Error.Code != "invalid_argument" || body.Error.Message == "" {
			t.Fatalf("graph%s: %d %s", query, response.Code, response.Body)
		}
	}
}

type refsBody struct {
	Branches []struct {
		Name         string `json:"name"`
		Oid          string `json:"oid"`
		Current      bool   `json:"current"`
		Upstream     string `json:"upstream"`
		Ahead        int    `json:"ahead"`
		Behind       int    `json:"behind"`
		UpstreamGone bool   `json:"upstreamGone"`
	} `json:"branches"`
	Remotes []struct {
		Name     string `json:"name"`
		URL      string `json:"url"`
		Branches []struct {
			Name   string `json:"name"`
			Branch string `json:"branch"`
			Oid    string `json:"oid"`
		} `json:"branches"`
	} `json:"remotes"`
	Tags []struct {
		Name string `json:"name"`
		Oid  string `json:"oid"`
	} `json:"tags"`
}

func TestRefs(t *testing.T) {
	h := newHistoryRepo(t)
	h.Git("update-ref", "-d", "refs/remotes/origin/experiment")
	origin := filepath.Join(t.TempDir(), "origin.git")
	h.Git("init", "--quiet", "--bare", origin)
	h.Git("remote", "add", "origin", origin)
	h.Git("remote", "add", "backup", "https://ada:s3cret-token@example.com/backup.git")
	h.Git("push", "--quiet", "-u", "origin", "main", "feature/login")
	h.Git("remote", "set-head", "origin", "main")

	// main is one commit ahead of origin/main.
	ahead := h.Commit("b.txt", "local\n", "local only")
	// origin/feature/login has a commit the local branch lacks.
	newer := h.Git("commit-tree", "-p", h.feature, "-m", "pushed elsewhere", h.feature+"^{tree}")
	h.Git("update-ref", "refs/remotes/origin/feature/login", newer)
	// old tracks a remote branch that no longer exists.
	h.Git("branch", "old", h.root)
	h.Git("config", "branch.old.remote", "origin")
	h.Git("config", "branch.old.merge", "refs/heads/old")

	h.Git("tag", "v1", h.root)
	h.Git("tag", "-a", "v2", "-m", "release two", h.merge)
	f := newFixture(t, h.Repo)

	response := f.get(t, "/api/v1/repos/"+f.repoID+"/refs")
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body)
	}
	got := decode[struct{ Data refsBody }](t, response).Data

	if len(got.Branches) != 4 {
		t.Fatalf("branches = %+v", got.Branches)
	}
	feature, main, old, topic := got.Branches[0], got.Branches[1], got.Branches[2], got.Branches[3]
	if feature.Name != "feature/login" || feature.Oid != h.feature || feature.Current ||
		feature.Upstream != "origin/feature/login" || feature.Ahead != 0 || feature.Behind != 1 {
		t.Fatalf("feature/login = %+v", feature)
	}
	if main.Name != "main" || main.Oid != ahead || !main.Current || main.Upstream != "origin/main" ||
		main.Ahead != 1 || main.Behind != 0 || main.UpstreamGone {
		t.Fatalf("main = %+v", main)
	}
	if old.Name != "old" || old.Upstream != "origin/old" || !old.UpstreamGone || old.Ahead != 0 || old.Behind != 0 {
		t.Fatalf("old = %+v", old)
	}
	if topic.Name != "topic" || topic.Oid != h.topic || topic.Upstream != "" || topic.Current {
		t.Fatalf("topic = %+v", topic)
	}

	if len(got.Remotes) != 2 || got.Remotes[0].Name != "backup" || len(got.Remotes[0].Branches) != 0 ||
		got.Remotes[1].Name != "origin" {
		t.Fatalf("remotes = %+v", got.Remotes)
	}
	// A password in a remote's URL is not shown.
	if got.Remotes[0].URL != "https://ada:xxxxx@example.com/backup.git" || got.Remotes[1].URL != origin {
		t.Fatalf("remote URLs = %q, %q", got.Remotes[0].URL, got.Remotes[1].URL)
	}
	remote := got.Remotes[1].Branches
	if len(remote) != 2 ||
		remote[0].Name != "origin/feature/login" || remote[0].Branch != "feature/login" || remote[0].Oid != newer ||
		remote[1].Name != "origin/main" || remote[1].Branch != "main" || remote[1].Oid != h.merge {
		t.Fatalf("origin branches (origin/HEAD must be omitted) = %+v", remote)
	}

	if len(got.Tags) != 2 || got.Tags[0].Name != "v1" || got.Tags[0].Oid != h.root ||
		got.Tags[1].Name != "v2" || got.Tags[1].Oid != h.merge {
		t.Fatalf("tags (annotated tags resolve to their commit) = %+v", got.Tags)
	}
}

func TestRefsOfEmptyRepository(t *testing.T) {
	f := newFixture(t, gittest.Init(t))

	response := f.get(t, "/api/v1/repos/"+f.repoID+"/refs")
	if response.Code != http.StatusOK || response.Body.String() != "{\"data\":{\"branches\":[],\"remotes\":[],\"tags\":[]}}\n" {
		t.Fatalf("refs of empty repository: %d %s", response.Code, response.Body)
	}
}
