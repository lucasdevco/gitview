package query

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// CommitDetails is everything the details pane shows for one commit: the
// graph fields, the message body and the files it changed.
type CommitDetails struct {
	GraphCommit
	// Body is the message after the subject line, without trailing blank
	// lines; empty when the message is a single line.
	Body string `json:"body"`
	// Files are the paths the commit changed, in git's order. A merge commit
	// is compared with its first parent, so the list shows what the merge
	// brought into the branch; it is empty when the merge changed nothing.
	Files []FileChange `json:"files"`
}

// CommitNotFoundError reports an oid that names no commit in the repository.
type CommitNotFoundError struct{ Oid string }

func (e *CommitNotFoundError) Error() string {
	return fmt.Sprintf("no commit %s in this repository; it may have been removed by a rebase or garbage collection, refresh the history", e.Oid)
}

const commitFieldCount = graphFieldCount + 1

// Commit returns the details of the commit named by oid, a full or
// abbreviated hexadecimal object id.
func Commit(ctx context.Context, r *repo.Repository, oid string) (CommitDetails, error) {
	commit, err := readCommit(ctx, r, oid)
	if err != nil {
		return CommitDetails{}, err
	}
	command := git.Read("diff-tree", "-r", "-z", "--name-status").Arg(commitDiffArgs(commit.GraphCommit)...).Arg("--")
	result, err := r.Runner.Run(ctx, command)
	if err != nil {
		return CommitDetails{}, err
	}
	commit.Files, err = parseNameStatus(result.Stdout)
	return commit, err
}

// readCommit resolves oid to a commit and reads its metadata and message.
func readCommit(ctx context.Context, r *repo.Repository, oid string) (CommitDetails, error) {
	if err := validateOid(oid); err != nil {
		return CommitDetails{}, err
	}
	full, found, err := readOptional(ctx, r.Runner, git.Read("rev-parse", "--quiet", "--verify", oid+"^{commit}"))
	if err != nil {
		return CommitDetails{}, err
	}
	if !found {
		return CommitDetails{}, &CommitNotFoundError{Oid: oid}
	}
	result, err := r.Runner.Run(ctx, git.Read("show", "-s", "--no-show-signature",
		"--format=%H%x00%P%x00%an%x00%ae%x00%at%x00%ct%x00%s%x00%b", full, "--"))
	if err != nil {
		return CommitDetails{}, err
	}
	fields := strings.SplitN(strings.TrimSuffix(string(result.Stdout), "\n"), "\x00", commitFieldCount)
	if len(fields) != commitFieldCount {
		return CommitDetails{}, fmt.Errorf("unexpected git show output for %s: %q", full, result.Stdout)
	}
	graph, err := parseGraphRecord(fields[:graphFieldCount])
	if err != nil {
		return CommitDetails{}, err
	}
	return CommitDetails{GraphCommit: graph, Body: strings.TrimRight(fields[graphFieldCount], "\n "), Files: []FileChange{}}, nil
}

// commitDiffArgs are the diff-tree arguments comparing a commit with its
// first parent, or with the empty tree for a root commit. Rename detection
// is on.
func commitDiffArgs(commit GraphCommit) []string {
	if len(commit.Parents) == 0 {
		return []string{"--find-renames", "--root", "--no-commit-id", commit.Oid}
	}
	return []string{"--find-renames", commit.Parents[0], commit.Oid}
}

// validateOid accepts only hexadecimal object ids, so the value can never be
// read as an option or a revision expression.
func validateOid(oid string) error {
	if len(oid) < 4 || len(oid) > 64 {
		return &InvalidRequestError{Message: fmt.Sprintf("commit %q is not a commit id; pass 4 to 64 hexadecimal characters", oid)}
	}
	for _, c := range oid {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return &InvalidRequestError{Message: fmt.Sprintf("commit %q is not a commit id; pass lowercase hexadecimal characters only", oid)}
		}
	}
	return nil
}

// parseNameStatus parses `git diff-tree --name-status -z`: a status field
// then the path, or for renames and copies a status with a similarity score
// ("R086"), the old path and the new path, each NUL-terminated.
func parseNameStatus(output []byte) ([]FileChange, error) {
	files := []FileChange{}
	fields := bytes.Split(bytes.TrimSuffix(output, []byte{0}), []byte{0})
	for i := 0; i < len(fields); i++ {
		status := string(fields[i])
		if status == "" {
			continue
		}
		kind, ok := changeKind(status[0])
		if !ok || i+1 >= len(fields) {
			return nil, malformedNameStatus(status)
		}
		change := FileChange{Status: kind}
		if kind == ChangeRenamed || kind == ChangeCopied {
			if i+2 >= len(fields) {
				return nil, malformedNameStatus(status)
			}
			change.OldPath, change.Path = string(fields[i+1]), string(fields[i+2])
			i += 2
		} else {
			change.Path = string(fields[i+1])
			i++
		}
		files = append(files, change)
	}
	return files, nil
}

func malformedNameStatus(status string) error {
	return fmt.Errorf("unexpected git diff-tree status %q; please report this with your git version", status)
}
