// Package query reads repository state through the git execution layer. It
// never changes the repository.
package query

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// State is the operation a repository is in the middle of.
type State string

const (
	StateClean         State = "clean"
	StateMerging       State = "merging"
	StateRebasing      State = "rebasing"
	StateCherryPicking State = "cherry-picking"
	StateReverting     State = "reverting"
)

// Identity is the author identity new commits will use.
type Identity struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

// Summary describes a repository at a glance.
type Summary struct {
	Name string `json:"name"`
	Root string `json:"root"`
	// Branch is the checked-out branch's short name; empty when detached.
	Branch   string `json:"branch"`
	Detached bool   `json:"detached"`
	// Head is the commit HEAD points to; empty when there are no commits yet.
	Head     string   `json:"head"`
	Empty    bool     `json:"empty"`
	State    State    `json:"state"`
	Identity Identity `json:"identity"`
	// MergeMessage is the message git prepared for the merge commit while
	// merging (MERGE_MSG without its comment lines); empty otherwise.
	MergeMessage string `json:"mergeMessage"`
}

// Summarize reads the repository's name, current branch, HEAD, in-progress
// operation and commit identity.
func Summarize(ctx context.Context, r *repo.Repository) (Summary, error) {
	summary := Summary{Name: r.Name(), Root: r.Root, State: InProgressState(r.GitDir)}
	if summary.State == StateMerging {
		summary.MergeMessage = mergeMessage(r.GitDir)
	}

	branch, found, err := readOptional(ctx, r.Runner, git.Read("symbolic-ref", "--quiet", "--short", "HEAD"))
	if err != nil {
		return Summary{}, err
	}
	summary.Branch, summary.Detached = branch, !found

	head, found, err := readOptional(ctx, r.Runner, git.Read("rev-parse", "--quiet", "--verify", "HEAD^{commit}"))
	if err != nil {
		return Summary{}, err
	}
	summary.Head, summary.Empty = head, !found

	summary.Identity = authorIdentity(ctx, r.Runner)
	return summary, nil
}

// authorIdentity is the author identity git commit will record, wherever git
// finds it: GIT_AUTHOR_* variables, user.* config, or a name and address
// guessed from the account. git var applies the same strict rules as git
// commit, so when it fails a commit would fail too and the identity is
// reported as unset.
//
//	git var GIT_AUTHOR_IDENT  →  Name <email> 1700000000 +0100
func authorIdentity(ctx context.Context, runner git.Runner) Identity {
	result, err := runner.Run(ctx, git.Read("var", "GIT_AUTHOR_IDENT"))
	if err != nil {
		return Identity{}
	}
	ident := strings.TrimSpace(string(result.Stdout))
	start, end := strings.LastIndex(ident, " <"), strings.LastIndex(ident, ">")
	if start < 0 || end < start {
		return Identity{}
	}
	return Identity{Name: ident[:start], Email: ident[start+2 : end]}
}

// readOptional runs a command whose exit status 1 means "no value" rather
// than failure, as with symbolic-ref --quiet, rev-parse --verify --quiet and
// config --get.
func readOptional(ctx context.Context, runner git.Runner, command *git.Command) (string, bool, error) {
	result, err := runner.Run(ctx, command)
	var gitErr *git.Error
	if errors.As(err, &gitErr) && gitErr.ExitCode == 1 {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return strings.TrimSpace(string(result.Stdout)), true, nil
}

// InProgressState reads the operation in progress from the state files git
// leaves in the git directory, without running git.
//
// A rebase is reported over a merge, which a rebase replaying merge commits
// can leave behind. CHERRY_PICK_HEAD during a rebase is ambiguous: older git
// versions leave it naming the commit the rebase stopped at, but it is also
// written by a cherry-pick started while the rebase was stopped. That
// cherry-pick has to be concluded first, so it is reported.
func InProgressState(gitDir string) State {
	exists := func(name string) bool {
		_, err := os.Stat(filepath.Join(gitDir, name))
		return err == nil
	}
	switch {
	case exists("rebase-merge"), exists("rebase-apply"):
		if cherryPickDuringRebase(gitDir) {
			return StateCherryPicking
		}
		return StateRebasing
	case exists("MERGE_HEAD"):
		return StateMerging
	case exists("CHERRY_PICK_HEAD"):
		return StateCherryPicking
	case exists("REVERT_HEAD"):
		return StateReverting
	default:
		return StateClean
	}
}

// mergeMessage reads the merge commit message git prepared in MERGE_MSG,
// dropping the "#" comment lines (such as the list of conflicts) that git
// would strip when editing it.
func mergeMessage(gitDir string) string {
	content, err := os.ReadFile(filepath.Join(gitDir, "MERGE_MSG"))
	if err != nil {
		return ""
	}
	var lines []string
	for line := range strings.SplitSeq(string(content), "\n") {
		if !strings.HasPrefix(line, "#") {
			lines = append(lines, strings.TrimRight(line, " \t\r"))
		}
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

// cherryPickDuringRebase reports whether CHERRY_PICK_HEAD belongs to a
// cherry-pick of its own rather than to the stopped rebase step, whose
// (possibly abbreviated) commit id rebase-merge/stopped-sha holds.
func cherryPickDuringRebase(gitDir string) bool {
	cherryPick, err := os.ReadFile(filepath.Join(gitDir, "CHERRY_PICK_HEAD"))
	if err != nil {
		return false
	}
	stopped, err := os.ReadFile(filepath.Join(gitDir, "rebase-merge", "stopped-sha"))
	if err != nil {
		return true
	}
	stoppedAt := strings.TrimSpace(string(stopped))
	return stoppedAt == "" || !strings.HasPrefix(strings.TrimSpace(string(cherryPick)), stoppedAt)
}
