package query

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gitview/internal/git"
	"gitview/internal/repo"
)

// Submodule is a submodule declared in .gitmodules and recorded in the
// index.
type Submodule struct {
	// Path is where the submodule is checked out, relative to the root.
	Path string `json:"path"`
	// Oid is the submodule commit the index records (what the next commit of
	// this repository will pin).
	Oid string `json:"oid"`
}

// Submodules lists the repository's submodules sorted by path. It reads
// .gitmodules for their paths and the index for their commits, so it never
// enters the submodules themselves.
//
//	git config --file .gitmodules -z --get-regexp ^submodule\..*\.path$
//	git ls-files --stage -z -- <path>...
func Submodules(ctx context.Context, r *repo.Repository) ([]Submodule, error) {
	submodules := []Submodule{}
	if _, err := os.Stat(filepath.Join(r.Root, ".gitmodules")); errors.Is(err, os.ErrNotExist) {
		return submodules, nil
	}
	declared, found, err := readOptional(ctx, r.Runner,
		git.Read("config", "--file", ".gitmodules", "-z", "--get-regexp", `^submodule\..*\.path$`))
	if err != nil || !found {
		return submodules, err
	}
	var specs []string
	for record := range strings.SplitSeq(declared, "\x00") {
		// Each record is "<key>\n<value>".
		if _, path, ok := strings.Cut(record, "\n"); ok && path != "" {
			specs = append(specs, literal(path))
		}
	}
	if len(specs) == 0 {
		return submodules, nil
	}
	staged, err := r.Runner.Run(ctx, git.Read("ls-files", "--stage", "-z", "--").Arg(specs...))
	if err != nil {
		return nil, err
	}
	// Each entry is "<mode> <oid> <stage>\t<path>"; submodules are gitlinks,
	// mode 160000.
	for entry := range strings.SplitSeq(string(staged.Stdout), "\x00") {
		info, path, ok := strings.Cut(entry, "\t")
		fields := strings.Fields(info)
		if !ok || len(fields) != 3 || fields[0] != "160000" {
			continue
		}
		submodules = append(submodules, Submodule{Path: path, Oid: fields[1]})
	}
	sort.Slice(submodules, func(i, j int) bool { return submodules[i].Path < submodules[j].Path })
	return submodules, nil
}
