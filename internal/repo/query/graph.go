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

// GraphCommit is one commit of the history graph: enough to lay out lanes
// and fill a history row. Details such as the body and files are loaded per
// commit when it is selected.
type GraphCommit struct {
	Oid string `json:"oid"`
	// Parents lists parent oids, first parent first. Empty for a root commit.
	Parents []string `json:"parents"`
	Author  string   `json:"author"`
	Email   string   `json:"email"`
	// AuthorTime and CommitTime are Unix seconds.
	AuthorTime int64  `json:"authorTime"`
	CommitTime int64  `json:"commitTime"`
	Subject    string `json:"subject"`
}

// GraphScope selects which history the graph covers.
type GraphScope string

const (
	// ScopeAll covers every local branch, tag and HEAD (and remote-tracking
	// branches when requested).
	ScopeAll GraphScope = "all"
	// ScopeCurrent covers only the history of HEAD.
	ScopeCurrent GraphScope = "current"
)

// GraphOptions chooses the commits Graph returns.
type GraphOptions struct {
	Scope GraphScope
	// Remotes includes commits reachable only from remote-tracking branches.
	// It only matters for ScopeAll.
	Remotes bool
}

const graphFieldCount = 7

// Graph returns every commit in scope, newest first and with every commit
// listed before its parents, which is the order the graph layout needs. It
// never truncates: the whole topology is needed to draw continuous lanes.
func Graph(ctx context.Context, r *repo.Repository, options GraphOptions) ([]GraphCommit, error) {
	_, hasHead, err := readOptional(ctx, r.Runner, git.Read("rev-parse", "--quiet", "--verify", "HEAD^{commit}"))
	if err != nil {
		return nil, err
	}
	command := git.Read("log", "--date-order", "--no-show-signature",
		"--format=%H%x00%P%x00%an%x00%ae%x00%at%x00%ct%x00%s")
	switch options.Scope {
	case ScopeCurrent:
		if !hasHead {
			return []GraphCommit{}, nil
		}
	case ScopeAll, "":
		command.Arg("--branches", "--tags").ArgIf(options.Remotes, "--remotes")
	default:
		return nil, fmt.Errorf("unknown graph scope %q", options.Scope)
	}
	command.ArgIf(hasHead, "HEAD").Arg("--")

	result, err := r.Runner.Run(ctx, command)
	if err != nil {
		return nil, err
	}
	return parseGraph(result.Stdout)
}

func parseGraph(output []byte) ([]GraphCommit, error) {
	commits := []GraphCommit{}
	for line := range bytes.Lines(output) {
		line = bytes.TrimSuffix(line, []byte("\n"))
		if len(line) == 0 {
			continue
		}
		fields := strings.SplitN(string(line), "\x00", graphFieldCount)
		if len(fields) != graphFieldCount {
			return nil, fmt.Errorf("unexpected git log record %q", line)
		}
		authorTime, err := strconv.ParseInt(fields[4], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("bad author time in git log record %q: %w", line, err)
		}
		commitTime, err := strconv.ParseInt(fields[5], 10, 64)
		if err != nil {
			return nil, fmt.Errorf("bad commit time in git log record %q: %w", line, err)
		}
		parents := strings.Fields(fields[1])
		if parents == nil {
			parents = []string{}
		}
		commits = append(commits, GraphCommit{
			Oid:        fields[0],
			Parents:    parents,
			Author:     fields[2],
			Email:      fields[3],
			AuthorTime: authorTime,
			CommitTime: commitTime,
			Subject:    fields[6],
		})
	}
	return commits, nil
}
