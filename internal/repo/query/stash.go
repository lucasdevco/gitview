package query

import (
	"bytes"
	"context"
	"fmt"
	"strconv"
	"strings"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// Stash is one entry of the stash list, newest first.
type Stash struct {
	// Index is the entry's position in the list: 0 is stash@{0}, the newest.
	// It changes whenever a stash is pushed or dropped.
	Index int `json:"index"`
	// Name is the reflog name, e.g. "stash@{0}".
	Name string `json:"name"`
	// Oid is the stash commit; unlike Index it never changes.
	Oid string `json:"oid"`
	// Message is git's description, e.g. "On main: half-done login form" or
	// "WIP on main: 1a2b3c4 Add login".
	Message string `json:"message"`
	// Time is when the stash was made, in Unix seconds.
	Time int64 `json:"time"`
}

// StashDetails is a stash and the files it saved.
type StashDetails struct {
	Stash
	// Base is the commit HEAD pointed at when the stash was made.
	Base string `json:"base"`
	// Files are the tracked files the stash changed relative to Base (staged
	// and unstaged changes combined, as in the working tree when stashed),
	// then the untracked files it saved, with status "untracked".
	Files []FileChange `json:"files"`
}

// StashNotFoundError reports a stash index beyond the end of the stash list.
type StashNotFoundError struct{ Index int }

func (e *StashNotFoundError) Error() string {
	return fmt.Sprintf("no stash@{%d} in this repository; the stash list may have changed, refresh it", e.Index)
}

const stashFieldCount = 5

// Stashes lists the repository's stashes, newest first.
func Stashes(ctx context.Context, r *repo.Repository) ([]Stash, error) {
	result, err := r.Runner.Run(ctx, git.Read("stash", "list", "-z", "--format=%gd%x00%H%x00%P%x00%ct%x00%gs"))
	if err != nil {
		return nil, err
	}
	stashes := []Stash{}
	output := bytes.TrimSuffix(result.Stdout, []byte{0})
	if len(output) == 0 {
		return stashes, nil
	}
	fields := strings.Split(string(output), "\x00")
	if len(fields)%stashFieldCount != 0 {
		return nil, fmt.Errorf("unexpected git stash list output: %q", result.Stdout)
	}
	for i := 0; i < len(fields); i += stashFieldCount {
		record := fields[i : i+stashFieldCount]
		index, ok := parseStashName(record[0])
		time, err := strconv.ParseInt(record[3], 10, 64)
		if !ok || err != nil {
			return nil, fmt.Errorf("unexpected git stash list entry: %q", strings.Join(record, " "))
		}
		stashes = append(stashes, Stash{Index: index, Name: record[0], Oid: record[1], Message: record[4], Time: time})
	}
	return stashes, nil
}

// parseStashName reads N from "stash@{N}".
func parseStashName(name string) (int, bool) {
	digits, ok := strings.CutPrefix(name, "stash@{")
	if !ok {
		return 0, false
	}
	digits, ok = strings.CutSuffix(digits, "}")
	if !ok {
		return 0, false
	}
	index, err := strconv.Atoi(digits)
	return index, err == nil && index >= 0
}

// FindStash returns the stash at index.
func FindStash(ctx context.Context, r *repo.Repository, index int) (Stash, error) {
	if index < 0 {
		return Stash{}, &InvalidRequestError{Message: fmt.Sprintf("stash index %d is negative; pass 0 for the newest stash", index)}
	}
	stashes, err := Stashes(ctx, r)
	if err != nil {
		return Stash{}, err
	}
	for _, stash := range stashes {
		if stash.Index == index {
			return stash, nil
		}
	}
	return Stash{}, &StashNotFoundError{Index: index}
}

// StashFiles returns the stash at index and the files it saved.
func StashFiles(ctx context.Context, r *repo.Repository, index int) (StashDetails, error) {
	stash, err := FindStash(ctx, r, index)
	if err != nil {
		return StashDetails{}, err
	}
	commit, err := readCommit(ctx, r, stash.Oid)
	if err != nil {
		return StashDetails{}, err
	}
	if len(commit.Parents) < 2 {
		return StashDetails{}, fmt.Errorf("%s (%s) is not a stash commit: it has %d parents", stash.Name, stash.Oid, len(commit.Parents))
	}
	result, err := r.Runner.Run(ctx, git.Read("diff-tree", "-r", "-z", "--name-status").Arg(commitDiffArgs(commit.GraphCommit)...).Arg("--"))
	if err != nil {
		return StashDetails{}, err
	}
	files, err := parseNameStatus(result.Stdout)
	if err != nil {
		return StashDetails{}, err
	}
	if untracked, ok := stashUntrackedCommit(commit.GraphCommit); ok {
		result, err := r.Runner.Run(ctx, git.Read("ls-tree", "-r", "-z", "--name-only", untracked, "--"))
		if err != nil {
			return StashDetails{}, err
		}
		for _, path := range bytes.Split(bytes.TrimSuffix(result.Stdout, []byte{0}), []byte{0}) {
			if len(path) > 0 {
				files = append(files, FileChange{Path: string(path), Status: ChangeUntracked})
			}
		}
	}
	return StashDetails{Stash: stash, Base: commit.Parents[0], Files: files}, nil
}

// stashUntrackedCommit returns the commit holding a stash's untracked files:
// its third parent, present when the stash was made with --include-untracked.
func stashUntrackedCommit(stash GraphCommit) (string, bool) {
	if len(stash.Parents) < 3 {
		return "", false
	}
	return stash.Parents[2], true
}

// stashDiffCommand builds the diff of one file saved in a stash: a tracked
// file against the stash's base commit, or an untracked file as added.
func stashDiffCommand(ctx context.Context, r *repo.Repository, request DiffRequest) (*git.Command, error) {
	stash, err := readCommit(ctx, r, request.Commit)
	if err != nil {
		return nil, err
	}
	if len(stash.Parents) < 2 {
		return nil, &InvalidRequestError{Message: fmt.Sprintf("commit %s is not a stash; pass the oid of an entry of the stash list", request.Commit)}
	}
	if untracked, ok := stashUntrackedCommit(stash.GraphCommit); ok {
		_, saved, err := readOptional(ctx, r.Runner, git.Read("rev-parse", "--quiet", "--verify", untracked+":"+request.Path))
		if err != nil {
			return nil, err
		}
		if saved {
			return git.Read("diff-tree", "-r", "--patch", "--no-color", "--no-ext-diff", "--no-textconv", "--root", "--no-commit-id", untracked).
				Arg("--", literal(request.Path)), nil
		}
	}
	return commitDiffCommand(stash.GraphCommit, request), nil
}
