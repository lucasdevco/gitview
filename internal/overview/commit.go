package overview

import (
	"context"
	"fmt"
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
	commit := CommitReview{OID: fields[0], ParentOID: parent, Author: fields[2], AuthorEmail: fields[3], AuthoredAt: fields[4], Subject: fields[5], Patch: patch}
	for _, line := range strings.Split(patch, "\n") {
		switch {
		case strings.HasPrefix(line, "diff --git "):
			commit.Files++
		case strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++"):
			commit.Additions++
		case strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---"):
			commit.Deletions++
		}
	}
	return commit, nil
}
