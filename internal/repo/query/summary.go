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
}

// Summarize reads the repository's name, current branch, HEAD, in-progress
// operation and commit identity.
func Summarize(ctx context.Context, r *repo.Repository) (Summary, error) {
	summary := Summary{Name: r.Name(), Root: r.Root, State: inProgressState(r.GitDir)}

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

	if summary.Identity.Name, _, err = readOptional(ctx, r.Runner, git.Read("config", "--get", "user.name")); err != nil {
		return Summary{}, err
	}
	if summary.Identity.Email, _, err = readOptional(ctx, r.Runner, git.Read("config", "--get", "user.email")); err != nil {
		return Summary{}, err
	}
	return summary, nil
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

// inProgressState inspects the state files git leaves in the git directory.
// Rebase is checked first because a conflicted rebase step also leaves
// CHERRY_PICK_HEAD behind.
func inProgressState(gitDir string) State {
	exists := func(name string) bool {
		_, err := os.Stat(filepath.Join(gitDir, name))
		return err == nil
	}
	switch {
	case exists("rebase-merge"), exists("rebase-apply"):
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
