package query

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// ChangeKind is how a file differs between two sides of a comparison
// (HEAD and the index, or the index and the working tree).
type ChangeKind string

const (
	ChangeAdded       ChangeKind = "added"
	ChangeModified    ChangeKind = "modified"
	ChangeDeleted     ChangeKind = "deleted"
	ChangeRenamed     ChangeKind = "renamed"
	ChangeCopied      ChangeKind = "copied"
	ChangeTypeChanged ChangeKind = "typechanged"
	ChangeUntracked   ChangeKind = "untracked"
	ChangeConflicted  ChangeKind = "conflicted"
)

// FileChange is one changed path. OldPath is set for renames and copies.
type FileChange struct {
	Path    string     `json:"path"`
	OldPath string     `json:"oldPath,omitempty"`
	Status  ChangeKind `json:"status"`
}

// WorktreeStatus is the working tree status split the way the file status
// view shows it. A file can be both staged and unstaged when only part of its
// changes are in the index. Conflicted files appear only in Conflicted.
type WorktreeStatus struct {
	// Staged are differences between HEAD and the index.
	Staged []FileChange `json:"staged"`
	// Unstaged are differences between the index and the working tree for
	// tracked files.
	Unstaged []FileChange `json:"unstaged"`
	// Untracked are files git does not track and does not ignore.
	Untracked []FileChange `json:"untracked"`
	// Conflicted are unmerged paths left by a merge, rebase or similar.
	Conflicted []FileChange `json:"conflicted"`
}

// Status reads the working tree status with rename detection. Untracked
// directories are expanded to their files.
func Status(ctx context.Context, r *repo.Repository) (WorktreeStatus, error) {
	result, err := r.Runner.Run(ctx, git.Read("status", "--porcelain=v2", "-z", "--untracked-files=all", "--find-renames"))
	if err != nil {
		return WorktreeStatus{}, err
	}
	return parsePorcelainV2(result.Stdout)
}

// parsePorcelainV2 parses `git status --porcelain=v2 -z`. Each record is
// NUL-terminated; a rename or copy record is followed by its original path
// as a separate NUL-terminated field. Paths are never quoted with -z.
func parsePorcelainV2(output []byte) (WorktreeStatus, error) {
	status := WorktreeStatus{Staged: []FileChange{}, Unstaged: []FileChange{}, Untracked: []FileChange{}, Conflicted: []FileChange{}}
	fields := bytes.Split(output, []byte{0})
	for i := 0; i < len(fields); i++ {
		record := string(fields[i])
		if record == "" {
			continue
		}
		switch record[0] {
		case '1': // 1 XY sub mH mI mW hH hI path
			parts := strings.SplitN(record, " ", 9)
			if len(parts) != 9 {
				return WorktreeStatus{}, malformedStatus(record)
			}
			status.add(parts[1], parts[8], "")
		case '2': // 2 XY sub mH mI mW hH hI Xscore path NUL origPath
			parts := strings.SplitN(record, " ", 10)
			if len(parts) != 10 || i+1 >= len(fields) {
				return WorktreeStatus{}, malformedStatus(record)
			}
			i++
			status.add(parts[1], parts[9], string(fields[i]))
		case 'u': // u XY sub m1 m2 m3 mW h1 h2 h3 path
			parts := strings.SplitN(record, " ", 11)
			if len(parts) != 11 {
				return WorktreeStatus{}, malformedStatus(record)
			}
			status.Conflicted = append(status.Conflicted, FileChange{Path: parts[10], Status: ChangeConflicted})
		case '?':
			status.Untracked = append(status.Untracked, FileChange{Path: strings.TrimPrefix(record, "? "), Status: ChangeUntracked})
		case '!', '#':
			// Ignored files and headers are not requested and not shown.
		default:
			return WorktreeStatus{}, malformedStatus(record)
		}
	}
	return status, nil
}

// add records an ordinary or renamed entry. xy holds the index (X) and
// working tree (Y) status letters; '.' means unchanged on that side.
func (s *WorktreeStatus) add(xy, path, oldPath string) {
	if len(xy) != 2 {
		return
	}
	if kind, ok := changeKind(xy[0]); ok {
		change := FileChange{Path: path, Status: kind}
		if kind == ChangeRenamed || kind == ChangeCopied {
			change.OldPath = oldPath
		}
		s.Staged = append(s.Staged, change)
	}
	if kind, ok := changeKind(xy[1]); ok {
		s.Unstaged = append(s.Unstaged, FileChange{Path: path, Status: kind})
	}
}

func changeKind(letter byte) (ChangeKind, bool) {
	switch letter {
	case 'A':
		return ChangeAdded, true
	case 'M':
		return ChangeModified, true
	case 'D':
		return ChangeDeleted, true
	case 'R':
		return ChangeRenamed, true
	case 'C':
		return ChangeCopied, true
	case 'T':
		return ChangeTypeChanged, true
	default:
		return "", false
	}
}

func malformedStatus(record string) error {
	return fmt.Errorf("unexpected git status output %q; please report this with your git version", record)
}
