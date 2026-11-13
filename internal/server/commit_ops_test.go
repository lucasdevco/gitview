package server_test

import (
	"net/http"
	"reflect"
	"strings"
	"testing"

	"gitview/internal/gittest"
)

// The operations behind the history's commit context menu: detached
// checkout, tags, reset, revert and cherry-pick, and aborting the last two.

func TestCheckoutOfACommitDetachesHead(t *testing.T) {
	r := gittest.Init(t)
	first := r.Commit("a.txt", "one\n", "first")
	r.Commit("a.txt", "two\n", "second")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "checkout", map[string]any{"commit": first})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git switch --detach " + first}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("rev-parse", "HEAD"); got != first || currentBranch(r) != "" {
		t.Fatalf("HEAD = %s on %q, want detached at %s", got, currentBranch(r), first)
	}
}

func TestCheckoutOfACommitThatWouldOverwriteLocalChangesExplainsWhy(t *testing.T) {
	r := gittest.Init(t)
	first := r.Commit("a.txt", "one\n", "first")
	r.Commit("a.txt", "two\n", "second")
	r.Write("a.txt", "local edit\n")
	f := newFixture(t, r)

	code, response := f.operate(t, "checkout", map[string]any{"commit": first})

	if code != http.StatusConflict || response.Error.Code != "local_changes" {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if got := currentBranch(r); got != "main" {
		t.Fatalf("current branch = %q", got)
	}
}

func TestCheckoutNeedsExactlyOneOfBranchAndCommit(t *testing.T) {
	r := gittest.Init(t)
	head := r.Commit("a.txt", "one\n", "first")
	f := newFixture(t, r)
	for _, body := range []map[string]any{
		{},
		{"branch": "main", "commit": head},
		{"commit": "--orphan"},
	} {
		code, response := f.operate(t, "checkout", body)
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" || len(response.Error.Commands) != 0 {
			t.Fatalf("%v: status %d: %+v", body, code, response.Error)
		}
	}
}

func TestCreateTagWithAMessageMakesAnAnnotatedTag(t *testing.T) {
	r := gittest.Init(t)
	first := r.Commit("a.txt", "one\n", "first")
	r.Commit("a.txt", "two\n", "second")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "createTag", map[string]any{"name": "v1.0", "commit": first, "message": "First release"})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git tag -a -m 'First release' v1.0 " + first}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("cat-file", "-t", "v1.0"); got != "tag" {
		t.Fatalf("v1.0 is a %s, want an annotated tag object", got)
	}
	if got := r.Git("rev-parse", "v1.0^{commit}"); got != first {
		t.Fatalf("v1.0 points to %s, want %s", got, first)
	}
	if got := r.Git("tag", "-l", "--format=%(contents:subject)", "v1.0"); got != "First release" {
		t.Fatalf("tag message = %q", got)
	}
}

func TestCreateTagWithoutAMessageMakesALightweightTag(t *testing.T) {
	r := gittest.Init(t)
	head := r.Commit("a.txt", "one\n", "first")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "createTag", map[string]any{"name": "release/v1", "commit": head, "message": "  "})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git tag release/v1 " + head}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("cat-file", "-t", "release/v1"); got != "commit" {
		t.Fatalf("release/v1 is a %s, want a lightweight tag", got)
	}
	if got := f.refs(t).Tags; len(got) != 1 || got[0].Name != "release/v1" || got[0].Oid != head {
		t.Fatalf("refs tags = %+v", got)
	}
}

func TestCreateTagRejectsInvalidAndTakenNames(t *testing.T) {
	r := gittest.Init(t)
	head := r.Commit("a.txt", "one\n", "first")
	r.Git("tag", "v1")
	f := newFixture(t, r)
	for _, test := range []struct {
		name, want string
	}{
		{"", "missing tag name"},
		{"-v2", "is not a tag name"},
		{"bad..name", "is not a valid tag name"},
		{"with space", "is not a valid tag name"},
		{"v1", "a tag named \"v1\" already exists"},
	} {
		code, response := f.operate(t, "createTag", map[string]any{"name": test.name, "commit": head})
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" ||
			!strings.Contains(response.Error.Message, test.want) || len(response.Error.Commands) != 0 {
			t.Fatalf("%q: status %d: %+v", test.name, code, response.Error)
		}
	}
	code, response := f.operate(t, "createTag", map[string]any{"name": "v2", "commit": "0123456789abcdef0123456789abcdef01234567"})
	if code != http.StatusNotFound || response.Error.Code != "ref_not_found" {
		t.Fatalf("missing commit: status %d: %+v", code, response.Error)
	}
}

// resetRepo has two commits; the second adds b.txt, and the working tree
// has an uncommitted edit of a.txt.
func resetRepo(t *testing.T) (r *gittest.Repo, first string) {
	r = gittest.Init(t)
	first = r.Commit("a.txt", "one\n", "first")
	r.Commit("b.txt", "b\n", "second")
	r.Write("a.txt", "local edit\n")
	return r, first
}

func TestResetModes(t *testing.T) {
	for _, test := range []struct {
		mode, command string
		// staged and unstaged list the paths git status reports afterwards.
		staged, unstaged string
	}{
		{"soft", "git reset --soft", "b.txt", "a.txt"},
		{"", "git reset --mixed", "", "a.txt"},
		{"mixed", "git reset --mixed", "", "a.txt"},
	} {
		t.Run(test.mode, func(t *testing.T) {
			r, first := resetRepo(t)
			f := newFixture(t, r)

			commands := f.mustOperate(t, "reset", map[string]any{"commit": first, "mode": test.mode})

			if got := commandStrings(commands); !reflect.DeepEqual(got, []string{test.command + " " + first}) {
				t.Fatalf("unexpected commands: %q", got)
			}
			if got := r.Git("rev-parse", "HEAD"); got != first || currentBranch(r) != "main" {
				t.Fatalf("HEAD = %s on %q, want main at %s", got, currentBranch(r), first)
			}
			if got := r.Git("diff", "--cached", "--name-only"); got != test.staged {
				t.Fatalf("staged = %q, want %q", got, test.staged)
			}
			if got := r.Git("diff", "--name-only"); got != test.unstaged {
				t.Fatalf("unstaged = %q, want %q", got, test.unstaged)
			}
		})
	}
}

func TestHardResetDiscardsUncommittedChanges(t *testing.T) {
	r, first := resetRepo(t)
	f := newFixture(t, r)

	commands := f.mustOperate(t, "reset", map[string]any{"commit": first, "mode": "hard"})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git reset --hard " + first}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("status", "--porcelain"); got != "" {
		t.Fatalf("status = %q, want a clean working tree", got)
	}
	if got := readFile(t, r, "a.txt"); got != "one\n" {
		t.Fatalf("a.txt = %q", got)
	}
}

func TestResetOfADetachedHeadMovesOnlyHead(t *testing.T) {
	r := gittest.Init(t)
	first := r.Commit("a.txt", "one\n", "first")
	second := r.Commit("a.txt", "two\n", "second")
	r.Git("switch", "--quiet", "--detach")
	f := newFixture(t, r)

	f.mustOperate(t, "reset", map[string]any{"commit": first, "mode": "hard"})

	if got := r.Git("rev-parse", "HEAD"); got != first {
		t.Fatalf("HEAD = %s, want %s", got, first)
	}
	if got := r.Git("rev-parse", "main"); got != second {
		t.Fatalf("main = %s, want it left at %s", got, second)
	}
}

func TestResetRejectsUnknownModesAndMissingCommits(t *testing.T) {
	r, first := resetRepo(t)
	f := newFixture(t, r)
	for _, body := range []map[string]any{
		{"commit": first, "mode": "keep"},
		{"commit": ""},
		{"commit": "--hard"},
	} {
		code, response := f.operate(t, "reset", body)
		if code != http.StatusBadRequest || response.Error.Code != "invalid_request" || len(response.Error.Commands) != 0 {
			t.Fatalf("%v: status %d: %+v", body, code, response.Error)
		}
	}
}

// pickRepo has main and topic: topic adds b.txt (cleanly pickable) and
// changes a.txt (conflicting with main).
type pickRepo struct {
	*gittest.Repo
	clean, conflicting string
}

func newPickRepo(t *testing.T) pickRepo {
	r := gittest.Init(t)
	r.Commit("a.txt", "base\n", "base")
	r.Git("switch", "--quiet", "-c", "topic")
	clean := r.Commit("b.txt", "topic\n", "Add b")
	conflicting := r.Commit("a.txt", "topic\n", "Change a on topic")
	r.Git("switch", "--quiet", "main")
	r.Commit("a.txt", "main\n", "Change a on main")
	return pickRepo{r, clean, conflicting}
}

func TestCherryPickCopiesACommitOntoTheCurrentBranch(t *testing.T) {
	r := newPickRepo(t)
	f := newFixture(t, r.Repo)

	commands := f.mustOperate(t, "cherryPick", map[string]any{"commit": r.clean})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git cherry-pick " + r.clean}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("log", "-1", "--format=%s"); got != "Add b" {
		t.Fatalf("HEAD subject = %q", got)
	}
	if got := readFile(t, r.Repo, "b.txt"); got != "topic\n" {
		t.Fatalf("b.txt = %q", got)
	}
}

func TestCherryPickConflictLeavesTheRepositoryCherryPickingUntilCommitted(t *testing.T) {
	r := newPickRepo(t)
	f := newFixture(t, r.Repo)

	code, response := f.operate(t, "cherryPick", map[string]any{"commit": r.conflicting})

	if code != http.StatusConflict || response.Error.Code != "conflict" {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if got := f.repoState(t); got != "cherry-picking" {
		t.Fatalf("state = %q, want cherry-picking", got)
	}
	if got := f.conflictedPaths(t); !reflect.DeepEqual(got, []string{"a.txt"}) {
		t.Fatalf("conflicted = %q, want [a.txt]", got)
	}
	if got := f.summary(t).MergeMessage; !strings.HasPrefix(got, "Change a on topic") {
		t.Fatalf("mergeMessage = %q, want the picked commit's message", got)
	}

	r.Write("a.txt", "main and topic\n")
	f.mustOperate(t, "stage", map[string]any{"paths": []string{"a.txt"}})
	f.mustOperate(t, "commit", map[string]any{"message": "Change a on topic"})

	if got := f.repoState(t); got != "clean" {
		t.Fatalf("state = %q, want clean after committing", got)
	}
	if got := r.Git("log", "-1", "--format=%an %s"); got != "Ada Lovelace Change a on topic" {
		t.Fatalf("HEAD = %q", got)
	}
}

func TestAbortCherryPickRestoresTheBranch(t *testing.T) {
	r := newPickRepo(t)
	head := r.Git("rev-parse", "HEAD")
	f := newFixture(t, r.Repo)
	f.operate(t, "cherryPick", map[string]any{"commit": r.conflicting})

	commands := f.mustOperate(t, "abortCherryPick", map[string]any{})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git cherry-pick --abort"}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := f.repoState(t); got != "clean" {
		t.Fatalf("state = %q, want clean", got)
	}
	if got := r.Git("rev-parse", "HEAD"); got != head || r.Git("status", "--porcelain") != "" {
		t.Fatalf("HEAD = %s, want %s with a clean tree", got, head)
	}

	code, response := f.operate(t, "abortCherryPick", map[string]any{})
	if code != http.StatusConflict || response.Error.Code != "nothing_in_progress" {
		t.Fatalf("second abort: status %d: %+v", code, response.Error)
	}
}

func TestCherryPickOfAMergeCommitUsesItsFirstParent(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "base\n", "base")
	r.Git("switch", "--quiet", "-c", "topic")
	r.Commit("b.txt", "topic\n", "Add b")
	r.Git("switch", "--quiet", "-c", "feature", "main")
	r.Commit("c.txt", "feature\n", "Add c")
	r.Git("merge", "--quiet", "--no-ff", "-m", "Merge topic", "topic")
	merge := r.Git("rev-parse", "HEAD")
	r.Git("switch", "--quiet", "main")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "cherryPick", map[string]any{"commit": merge})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git cherry-pick -m 1 " + merge}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := readFile(t, r, "b.txt"); got != "topic\n" {
		t.Fatalf("b.txt = %q, want topic's change brought over", got)
	}
}

func TestCherryPickWithLocalChangesInTheWayExplainsWhy(t *testing.T) {
	r := newPickRepo(t)
	r.Write("a.txt", "local edit\n")
	f := newFixture(t, r.Repo)

	code, response := f.operate(t, "cherryPick", map[string]any{"commit": r.conflicting})

	if code != http.StatusConflict || response.Error.Code != "local_changes" {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if got := f.repoState(t); got != "clean" {
		t.Fatalf("state = %q, want clean", got)
	}
}

func TestRevertAddsACommitUndoingAnother(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "one\n", "first")
	second := r.Commit("b.txt", "b\n", "Add b")
	r.Commit("c.txt", "c\n", "Add c")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "revert", map[string]any{"commit": second})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git revert --no-edit " + second}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("log", "-1", "--format=%s"); got != `Revert "Add b"` {
		t.Fatalf("HEAD subject = %q", got)
	}
	if got := r.Git("ls-files"); got != "a.txt\nc.txt" {
		t.Fatalf("files = %q", got)
	}
}

func TestRevertOfAMergeCommitUndoesTheMergedBranch(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "base\n", "base")
	r.Git("switch", "--quiet", "-c", "topic")
	r.Commit("b.txt", "topic\n", "Add b")
	r.Git("switch", "--quiet", "main")
	r.Commit("c.txt", "main\n", "Add c")
	r.Git("merge", "--quiet", "--no-ff", "-m", "Merge topic", "topic")
	merge := r.Git("rev-parse", "HEAD")
	f := newFixture(t, r)

	commands := f.mustOperate(t, "revert", map[string]any{"commit": merge})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git revert --no-edit -m 1 " + merge}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := r.Git("ls-files"); got != "a.txt\nc.txt" {
		t.Fatalf("files = %q, want topic's b.txt removed", got)
	}
}

func TestRevertConflictLeavesTheRepositoryRevertingUntilAborted(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "one\n", "first")
	second := r.Commit("a.txt", "two\n", "second")
	head := r.Commit("a.txt", "three\n", "third")
	f := newFixture(t, r)

	code, response := f.operate(t, "revert", map[string]any{"commit": second})

	if code != http.StatusConflict || response.Error.Code != "conflict" {
		t.Fatalf("status %d: %+v", code, response.Error)
	}
	if got := f.repoState(t); got != "reverting" {
		t.Fatalf("state = %q, want reverting", got)
	}
	if got := f.conflictedPaths(t); !reflect.DeepEqual(got, []string{"a.txt"}) {
		t.Fatalf("conflicted = %q, want [a.txt]", got)
	}
	if got := f.summary(t).MergeMessage; !strings.HasPrefix(got, `Revert "second"`) {
		t.Fatalf("mergeMessage = %q, want the revert's message", got)
	}

	commands := f.mustOperate(t, "abortRevert", map[string]any{})

	if got := commandStrings(commands); !reflect.DeepEqual(got, []string{"git revert --abort"}) {
		t.Fatalf("unexpected commands: %q", got)
	}
	if got := f.repoState(t); got != "clean" {
		t.Fatalf("state = %q, want clean", got)
	}
	if got := r.Git("rev-parse", "HEAD"); got != head {
		t.Fatalf("HEAD = %s, want %s", got, head)
	}
	code, response = f.operate(t, "abortRevert", map[string]any{})
	if code != http.StatusConflict || response.Error.Code != "nothing_in_progress" {
		t.Fatalf("second abort: status %d: %+v", code, response.Error)
	}
}

func TestRevertConflictIsConcludedByCommitting(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "one\n", "first")
	second := r.Commit("a.txt", "two\n", "second")
	r.Commit("a.txt", "three\n", "third")
	f := newFixture(t, r)
	f.operate(t, "revert", map[string]any{"commit": second})
	r.Write("a.txt", "one and three\n")

	f.mustOperate(t, "stage", map[string]any{"paths": []string{"a.txt"}})
	f.mustOperate(t, "commit", map[string]any{"message": `Revert "second"`})

	if got := f.repoState(t); got != "clean" {
		t.Fatalf("state = %q, want clean after committing", got)
	}
}

func TestCommitOperationsRejectMissingOrOptionLikeCommits(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "one\n", "first")
	f := newFixture(t, r)
	for _, op := range []string{"cherryPick", "revert", "createTag"} {
		for _, commit := range []string{"", "--abort"} {
			code, response := f.operate(t, op, map[string]any{"commit": commit, "name": "v1"})
			if code != http.StatusBadRequest || response.Error.Code != "invalid_request" || len(response.Error.Commands) != 0 {
				t.Fatalf("%s %q: status %d: %+v", op, commit, code, response.Error)
			}
		}
	}
	code, response := f.operate(t, "revert", map[string]any{"commit": "0123456789abcdef0123456789abcdef01234567"})
	if code != http.StatusNotFound || response.Error.Code != "ref_not_found" {
		t.Fatalf("missing commit: status %d: %+v", code, response.Error)
	}
}
