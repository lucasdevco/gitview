package overview

import (
	"context"
	"fmt"
	"strconv"
	"strings"
)

type commitGit interface {
	ResolveRevision(context.Context, string) (string, error)
	CommitPatch(context.Context, string) (string, error)
}

func (s *Service) Commit(ctx context.Context, revision string) (CommitReviewReport, error) {
	repo, err := s.git.Repository(ctx)
	if err != nil {
		return CommitReviewReport{}, err
	}
	if repo.Empty || strings.TrimSpace(revision) == "" {
		return CommitReviewReport{}, &NotFoundError{Entity: "commit"}
	}
	git, ok := s.git.(commitGit)
	if !ok {
		return CommitReviewReport{}, fmt.Errorf("commit review is unavailable")
	}
	oid, err := git.ResolveRevision(ctx, revision)
	if err != nil {
		return CommitReviewReport{}, &NotFoundError{Entity: "commit"}
	}
	raw, err := git.CommitPatch(ctx, oid)
	if err != nil {
		return CommitReviewReport{}, fmt.Errorf("read commit patch: %w", err)
	}
	commit, err := parseCommitPatch(raw)
	if err != nil {
		return CommitReviewReport{}, err
	}
	return CommitReviewReport{Repository: repo, Commit: commit}, nil
}

func parseCommitPatch(raw string) (CommitReview, error) {
	headerAndPatch := strings.SplitN(strings.TrimPrefix(raw, "\x1e"), "\n", 2)
	fields := strings.SplitN(headerAndPatch[0], "\x1f", 6)
	if len(fields) != 6 {
		return CommitReview{}, fmt.Errorf("parse commit metadata: expected 6 fields")
	}
	parent := ""
	if parents := strings.Fields(fields[1]); len(parents) > 0 {
		parent = parents[0]
	}
	patch := ""
	if len(headerAndPatch) == 2 {
		patch = strings.TrimLeft(headerAndPatch[1], "\n")
	}
	patchFiles := ParsePatchFiles(patch)
	commit := CommitReview{OID: fields[0], ParentOID: parent, Author: fields[2], AuthorEmail: fields[3], AuthoredAt: fields[4], Subject: fields[5], Files: len(patchFiles), Patch: patch, PatchFiles: patchFiles}
	for _, line := range strings.Split(patch, "\n") {
		switch {
		case strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++"):
			commit.Additions++
		case strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---"):
			commit.Deletions++
		}
	}
	return commit, nil
}

func ParsePatchFiles(patch string) []PatchFile {
	sections := splitPatchSections(patch)
	files := make([]PatchFile, 0, len(sections))
	for _, section := range sections {
		oldPath, newPath := patchSectionPaths(section)
		path := newPath
		if path == "" {
			path = oldPath
		}
		if path == "" {
			continue
		}
		files = append(files, PatchFile{Path: path, OldPath: oldPath, NewPath: newPath, Status: patchStatus(oldPath, newPath), Patch: section})
	}
	return files
}

func patchStatus(oldPath, newPath string) string {
	switch {
	case oldPath == "":
		return "added"
	case newPath == "":
		return "deleted"
	case oldPath != newPath:
		return "renamed"
	default:
		return "modified"
	}
}

func splitPatchSections(patch string) []string {
	starts := []int{}
	for offset := 0; offset < len(patch); {
		index := strings.Index(patch[offset:], "diff --git ")
		if index < 0 {
			break
		}
		index += offset
		if index == 0 || patch[index-1] == '\n' {
			starts = append(starts, index)
		}
		offset = index + len("diff --git ")
	}
	sections := make([]string, 0, len(starts))
	for index, start := range starts {
		end := len(patch)
		if index+1 < len(starts) {
			end = starts[index+1]
		}
		sections = append(sections, strings.TrimRight(patch[start:end], "\n")+"\n")
	}
	return sections
}

func patchSectionPaths(section string) (string, string) {
	oldPath, newPath := "", ""
	for _, line := range strings.Split(section, "\n") {
		switch {
		case strings.HasPrefix(line, "--- "):
			oldPath = decodeDiffPath(strings.TrimPrefix(line, "--- "), "a/")
		case strings.HasPrefix(line, "+++ "):
			newPath = decodeDiffPath(strings.TrimPrefix(line, "+++ "), "b/")
		case strings.HasPrefix(line, "rename from "):
			oldPath = decodeDiffPath(strings.TrimPrefix(line, "rename from "), "")
		case strings.HasPrefix(line, "rename to "):
			newPath = decodeDiffPath(strings.TrimPrefix(line, "rename to "), "")
		}
	}
	if oldPath == "" && newPath == "" {
		oldPath, newPath = diffHeaderPaths(strings.SplitN(section, "\n", 2)[0])
	}
	return oldPath, newPath
}

func decodeDiffPath(raw, prefix string) string {
	if raw == "/dev/null" {
		return ""
	}
	value := raw
	if strings.HasPrefix(value, `"`) {
		if decoded, err := strconv.Unquote(value); err == nil {
			value = decoded
		}
	} else if separator := strings.IndexByte(value, '\t'); separator >= 0 {
		value = value[:separator]
	}
	return strings.TrimPrefix(value, prefix)
}

func diffHeaderPaths(header string) (string, string) {
	raw := strings.TrimPrefix(header, "diff --git ")
	if strings.HasPrefix(raw, `"`) {
		oldToken, rest := quotedPathToken(raw)
		newToken, _ := quotedPathToken(strings.TrimSpace(rest))
		if oldToken != "" && newToken != "" {
			return decodeDiffPath(oldToken, "a/"), decodeDiffPath(newToken, "b/")
		}
	}
	separator := strings.LastIndex(raw, " b/")
	quotedSeparator := strings.LastIndex(raw, ` "b/`)
	if quotedSeparator > separator {
		separator = quotedSeparator
	}
	if separator < 0 {
		return "", ""
	}
	return decodeDiffPath(raw[:separator], "a/"), decodeDiffPath(raw[separator+1:], "b/")
}

func quotedPathToken(raw string) (string, string) {
	if !strings.HasPrefix(raw, `"`) {
		return "", raw
	}
	escaped := false
	for index := 1; index < len(raw); index++ {
		switch {
		case escaped:
			escaped = false
		case raw[index] == '\\':
			escaped = true
		case raw[index] == '"':
			return raw[:index+1], raw[index+1:]
		}
	}
	return "", raw
}
