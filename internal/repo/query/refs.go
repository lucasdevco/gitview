package query

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// Branch is a local branch.
type Branch struct {
	// Name is the short name, e.g. "feature/login".
	Name    string `json:"name"`
	Oid     string `json:"oid"`
	Current bool   `json:"current"`
	// Upstream is the short name of the tracked branch, e.g. "origin/main";
	// empty when the branch tracks nothing.
	Upstream string `json:"upstream"`
	// Ahead and Behind count commits relative to Upstream.
	Ahead  int `json:"ahead"`
	Behind int `json:"behind"`
	// UpstreamGone is true when the tracked branch no longer exists.
	UpstreamGone bool `json:"upstreamGone"`
}

// RemoteBranch is a remote-tracking branch.
type RemoteBranch struct {
	// Name includes the remote, e.g. "origin/feature/login".
	Name string `json:"name"`
	// Branch is the name on the remote, e.g. "feature/login".
	Branch string `json:"branch"`
	Oid    string `json:"oid"`
}

// Remote is a configured remote and its remote-tracking branches.
type Remote struct {
	Name     string         `json:"name"`
	Branches []RemoteBranch `json:"branches"`
}

// Tag is a tag. Oid is the commit it points to; annotated tags are resolved
// through the tag object.
type Tag struct {
	Name string `json:"name"`
	Oid  string `json:"oid"`
}

// Refs is every branch, remote and tag of a repository, each list sorted by
// name.
type Refs struct {
	Branches []Branch `json:"branches"`
	Remotes  []Remote `json:"remotes"`
	Tags     []Tag    `json:"tags"`
}

const refFieldCount = 7

// ReadRefs lists local branches with upstream tracking, remotes with their
// branches, and tags. Ahead/behind counts come from a single for-each-ref
// call rather than one rev-list per branch.
func ReadRefs(ctx context.Context, r *repo.Repository) (Refs, error) {
	refs := Refs{Branches: []Branch{}, Remotes: []Remote{}, Tags: []Tag{}}

	result, err := r.Runner.Run(ctx, git.Read("remote"))
	if err != nil {
		return Refs{}, err
	}
	remotes := map[string]*Remote{}
	for _, name := range strings.Fields(string(result.Stdout)) {
		remotes[name] = &Remote{Name: name, Branches: []RemoteBranch{}}
	}

	result, err = r.Runner.Run(ctx, git.Read("for-each-ref",
		"--format=%(refname)%00%(objectname)%00%(*objectname)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(HEAD)%00%(symref)",
		"refs/heads", "refs/remotes", "refs/tags"))
	if err != nil {
		return Refs{}, err
	}
	for line := range strings.Lines(string(result.Stdout)) {
		line = strings.TrimSuffix(line, "\n")
		if line == "" {
			continue
		}
		fields := strings.Split(line, "\x00")
		if len(fields) != refFieldCount {
			return Refs{}, fmt.Errorf("unexpected git for-each-ref record %q", line)
		}
		refname, oid, peeled, upstream, track, head, symref := fields[0], fields[1], fields[2], fields[3], fields[4], fields[5], fields[6]
		switch {
		case strings.HasPrefix(refname, "refs/heads/"):
			branch := Branch{
				Name:     strings.TrimPrefix(refname, "refs/heads/"),
				Oid:      oid,
				Current:  head == "*",
				Upstream: upstream,
			}
			if branch.Ahead, branch.Behind, branch.UpstreamGone, err = parseTrack(track); err != nil {
				return Refs{}, err
			}
			refs.Branches = append(refs.Branches, branch)
		case strings.HasPrefix(refname, "refs/remotes/"):
			if symref != "" {
				continue // origin/HEAD names the remote's default branch, not a branch
			}
			name := strings.TrimPrefix(refname, "refs/remotes/")
			remote := remoteOf(name, remotes)
			if remotes[remote] == nil {
				remotes[remote] = &Remote{Name: remote, Branches: []RemoteBranch{}}
			}
			remotes[remote].Branches = append(remotes[remote].Branches, RemoteBranch{
				Name:   name,
				Branch: strings.TrimPrefix(name, remote+"/"),
				Oid:    oid,
			})
		case strings.HasPrefix(refname, "refs/tags/"):
			if peeled != "" {
				oid = peeled
			}
			refs.Tags = append(refs.Tags, Tag{Name: strings.TrimPrefix(refname, "refs/tags/"), Oid: oid})
		}
	}

	for _, remote := range remotes {
		refs.Remotes = append(refs.Remotes, *remote)
	}
	sort.Slice(refs.Remotes, func(i, j int) bool { return refs.Remotes[i].Name < refs.Remotes[j].Name })
	return refs, nil
}

// remoteOf finds which remote a remote-tracking branch such as
// "origin/feature/x" belongs to. Remote names may contain "/", so the longest
// configured remote name that prefixes the branch wins; refs left behind by
// a removed remote fall back to their first path segment.
func remoteOf(name string, remotes map[string]*Remote) string {
	best := ""
	for remote := range remotes {
		if strings.HasPrefix(name, remote+"/") && len(remote) > len(best) {
			best = remote
		}
	}
	if best == "" {
		best, _, _ = strings.Cut(name, "/")
	}
	return best
}

// parseTrack reads %(upstream:track,nobracket): "", "gone", "ahead 1",
// "behind 2" or "ahead 1, behind 2".
func parseTrack(track string) (ahead, behind int, gone bool, err error) {
	if track == "" {
		return 0, 0, false, nil
	}
	if track == "gone" {
		return 0, 0, true, nil
	}
	for part := range strings.SplitSeq(track, ", ") {
		label, count, ok := strings.Cut(part, " ")
		n, convErr := strconv.Atoi(count)
		if !ok || convErr != nil {
			return 0, 0, false, fmt.Errorf("unexpected upstream tracking info %q", track)
		}
		switch label {
		case "ahead":
			ahead = n
		case "behind":
			behind = n
		default:
			return 0, 0, false, fmt.Errorf("unexpected upstream tracking info %q", track)
		}
	}
	return ahead, behind, false, nil
}
