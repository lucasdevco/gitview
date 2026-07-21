package gitrepo

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	functionanalysis "gitview/internal/function"
	"gitview/internal/overview"
)

type Repository struct{ root string }

func Open(ctx context.Context, path string) (*Repository, error) {
	if path == "" {
		path = "."
	}
	root, err := run(ctx, path, "rev-parse", "--show-toplevel")
	if err != nil {
		return nil, fmt.Errorf("%q is not a readable Git repository: %w", path, err)
	}
	return &Repository{root: strings.TrimSpace(root)}, nil
}

func (r *Repository) Root() string { return r.root }

func (r *Repository) Directories(ctx context.Context, parent string) ([]string, error) {
	tree := "HEAD"
	if parent != "" {
		tree += ":" + parent
	}
	output, err := run(ctx, r.root, "ls-tree", "-d", "-z", "--name-only", tree)
	if err != nil {
		return nil, err
	}
	directories := []string{}
	for _, name := range strings.Split(output, "\x00") {
		if name == "" {
			continue
		}
		if parent != "" {
			name = parent + "/" + name
		}
		directories = append(directories, name)
	}
	return directories, nil
}

func (r *Repository) Repository(ctx context.Context) (overview.Repository, error) {
	fullBranch, _ := run(ctx, r.root, "symbolic-ref", "--quiet", "HEAD")
	branch := strings.TrimPrefix(strings.TrimSpace(fullBranch), "refs/heads/")
	head, err := run(ctx, r.root, "rev-parse", "--verify", "HEAD")
	if err != nil {
		if strings.TrimSpace(fullBranch) != "" {
			_, refErr := run(ctx, r.root, "show-ref", "--verify", "--quiet", strings.TrimSpace(fullBranch))
			var exitErr *exec.ExitError
			if errors.As(refErr, &exitErr) && exitErr.ExitCode() == 1 {
				return overview.Repository{Name: filepath.Base(r.root), Root: r.root, Branch: branch, Empty: true}, nil
			}
		}
		return overview.Repository{}, err
	}
	return overview.Repository{Name: filepath.Base(r.root), Root: r.root, Branch: branch, Head: strings.TrimSpace(head)}, nil
}

func (r *Repository) Commits(ctx context.Context, path string, destination io.Writer) error {
	args := []string{"-C", r.root, "log", "HEAD", "--root", "--use-mailmap", "--date=iso-strict", "--format=%x1e%H%x1f%aN%x1f%aE%x1f%aI%x1f%s", "--numstat"}
	if path != "" {
		args = append(args, "--", ":(literal)"+path)
	}
	cmd := exec.CommandContext(ctx, "git", args...)
	var stderr bytes.Buffer
	cmd.Stdout = destination
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		message := strings.TrimSpace(stderr.String())
		if message != "" {
			return fmt.Errorf("git failed: %s: %w", message, err)
		}
		return commandError(cmd, err)
	}
	return nil
}

func (r *Repository) IsShallow(ctx context.Context) (bool, error) {
	value, err := run(ctx, r.root, "rev-parse", "--is-shallow-repository")
	return strings.TrimSpace(value) == "true", err
}

func (r *Repository) SourceFiles(ctx context.Context, path string) ([]functionanalysis.SourceFile, error) {
	args := []string{"ls-tree", "-r", "-z", "HEAD"}
	if path != "" {
		args = append(args, "--", ":(literal)"+path)
	}
	output, err := run(ctx, r.root, args...)
	if err != nil {
		return nil, err
	}
	type sourceObject struct {
		oid  string
		path string
	}
	objects := []sourceObject{}
	excluded := []functionanalysis.SourceFile{}
	uniqueOIDs := []string{}
	seenOIDs := map[string]struct{}{}
	for _, entry := range strings.Split(output, "\x00") {
		metadataAndPath := strings.SplitN(entry, "\t", 2)
		if len(metadataAndPath) != 2 {
			continue
		}
		metadata := strings.Fields(metadataAndPath[0])
		candidate := metadataAndPath[1]
		if len(metadata) != 3 || metadata[1] != "blob" || !functionanalysis.IsSupportedSource(candidate) || !withinPath(candidate, path) {
			continue
		}
		if functionanalysis.IsExcludedSource(candidate) {
			excluded = append(excluded, functionanalysis.SourceFile{Path: candidate})
			continue
		}
		oid := metadata[2]
		objects = append(objects, sourceObject{oid: oid, path: candidate})
		if _, exists := seenOIDs[oid]; !exists {
			seenOIDs[oid] = struct{}{}
			uniqueOIDs = append(uniqueOIDs, oid)
		}
	}
	blobs, err := r.readBlobs(ctx, uniqueOIDs)
	if err != nil {
		return nil, err
	}
	files := make([]functionanalysis.SourceFile, 0, len(objects))
	for _, object := range objects {
		content, exists := blobs[object.oid]
		if !exists {
			return nil, fmt.Errorf("read %s: Git did not return blob %s", object.path, object.oid)
		}
		files = append(files, functionanalysis.SourceFile{Path: object.path, Content: content})
	}
	files = append(files, excluded...)
	return files, nil
}

func (r *Repository) readBlobs(ctx context.Context, oids []string) (map[string][]byte, error) {
	if len(oids) == 0 {
		return map[string][]byte{}, nil
	}
	input := strings.NewReader(strings.Join(oids, "\n") + "\n")
	batchCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	cmd := exec.CommandContext(batchCtx, "git", "-C", r.root, "cat-file", "--batch")
	cmd.Stdin = input
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("read Git blob batch: %w", err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return nil, commandError(cmd, err)
	}
	fail := func(readErr error) (map[string][]byte, error) {
		cancel()
		_ = cmd.Wait()
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, readErr
	}
	reader := bufio.NewReader(stdout)
	blobs := make(map[string][]byte, len(oids))
	const maxBlobBytes = 32 << 20
	const maxTotalBytes = 512 << 20
	totalBytes := 0
	for _, requestedOID := range oids {
		headerLine, readErr := reader.ReadString('\n')
		if readErr != nil {
			return fail(fmt.Errorf("read Git blob batch header for %s: %w", requestedOID, readErr))
		}
		header := strings.Fields(strings.TrimSuffix(headerLine, "\n"))
		if len(header) != 3 || header[0] != requestedOID || header[1] != "blob" {
			return fail(fmt.Errorf("read Git blob batch: invalid header %q", strings.TrimSpace(headerLine)))
		}
		size, parseErr := strconv.Atoi(header[2])
		if parseErr != nil || size < 0 {
			return fail(fmt.Errorf("read Git blob batch: invalid size %q", header[2]))
		}
		if size > maxBlobBytes {
			return fail(fmt.Errorf("read Git blob batch: source blob %s is %d bytes; maximum is %d bytes", requestedOID, size, maxBlobBytes))
		}
		totalBytes += size
		if totalBytes > maxTotalBytes {
			return fail(fmt.Errorf("read Git blob batch: source snapshot exceeds the %d byte memory limit", maxTotalBytes))
		}
		content := make([]byte, size)
		if _, readErr := io.ReadFull(reader, content); readErr != nil {
			return fail(fmt.Errorf("read Git blob batch content for %s: %w", requestedOID, readErr))
		}
		separator, readErr := reader.ReadByte()
		if readErr != nil || separator != '\n' {
			return fail(fmt.Errorf("read Git blob batch: truncated content for %s", requestedOID))
		}
		blobs[requestedOID] = content
	}
	if err := cmd.Wait(); err != nil {
		if message := strings.TrimSpace(stderr.String()); message != "" {
			return nil, fmt.Errorf("git failed: %s: %w", message, err)
		}
		return nil, commandError(cmd, err)
	}
	return blobs, nil
}

func (r *Repository) FunctionHistory(ctx context.Context, path string, destination io.Writer) error {
	if path != "" && functionanalysis.IsExcludedSource(path) {
		return nil
	}
	args := []string{"-C", r.root, "log", "HEAD", "--root", "--use-mailmap", "--date=iso-strict", "--format=%x1e%H%x1f%aN%x1f%aE%x1f%aI%x1f%s", "-p", "--unified=0", "--no-renames", "--no-prefix", "--"}
	if path != "" {
		args = append(args, ":(literal)"+path)
	} else {
		for _, extension := range functionanalysis.SupportedExtensions() {
			args = append(args, "*"+extension)
		}
		args = append(args, ":(exclude)vendor/**", ":(exclude)**/vendor/**", ":(exclude)node_modules/**", ":(exclude)**/node_modules/**")
	}
	cmd := exec.CommandContext(ctx, "git", args...)
	var stderr bytes.Buffer
	cmd.Stdout = destination
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if message := strings.TrimSpace(stderr.String()); message != "" {
			return fmt.Errorf("git failed: %s: %w", message, err)
		}
		return commandError(cmd, err)
	}
	return nil
}

func (r *Repository) ResolveRevision(ctx context.Context, revision string) (string, error) {
	value, err := run(ctx, r.root, "rev-parse", "--verify", "--end-of-options", revision+"^{commit}")
	return strings.TrimSpace(value), err
}

func (r *Repository) CommitPatch(ctx context.Context, oid string) (string, error) {
	return run(ctx, r.root, "show", "--no-color", "--no-ext-diff", "--find-renames", "--format=%x1e%H%x1f%P%x1f%aN%x1f%aE%x1f%aI%x1f%s", "--unified=3", "--end-of-options", oid)
}

func (r *Repository) Branches(ctx context.Context) ([]overview.BranchRef, error) {
	output, err := run(ctx, r.root, "for-each-ref", "--sort=refname", "--format=%(refname)%09%(objectname)%09%(HEAD)%09%(symref)%09%(upstream)", "refs/heads", "refs/remotes")
	if err != nil {
		return nil, err
	}
	branches := []overview.BranchRef{}
	for _, line := range strings.Split(strings.TrimSuffix(output, "\n"), "\n") {
		if line == "" {
			continue
		}
		fields := strings.SplitN(line, "\t", 5)
		if len(fields) != 5 || fields[3] != "" {
			continue
		}
		fullName := fields[0]
		remote := strings.HasPrefix(fullName, "refs/remotes/")
		name := strings.TrimPrefix(fullName, "refs/heads/")
		name = strings.TrimPrefix(name, "refs/remotes/")
		branch := overview.BranchRef{Name: name, FullName: fullName, OID: fields[1], Remote: remote, Current: fields[2] == "*"}
		if upstream := fields[4]; !remote && upstream != "" {
			branch.Upstream = strings.TrimPrefix(upstream, "refs/remotes/")
			branch.Upstream = strings.TrimPrefix(branch.Upstream, "refs/heads/")
			counts, countErr := run(ctx, r.root, "rev-list", "--left-right", "--count", fullName+"..."+upstream)
			if countErr == nil {
				values := strings.Fields(counts)
				if len(values) == 2 {
					branch.Ahead, _ = strconv.Atoi(values[0])
					branch.Behind, _ = strconv.Atoi(values[1])
				}
			}
		}
		branches = append(branches, branch)
	}
	return branches, nil
}

func (r *Repository) BranchCommits(ctx context.Context, revision string, limit int) ([]overview.BranchCommit, error) {
	args := []string{"log", "--date=iso-strict", fmt.Sprintf("--max-count=%d", limit), "--format=%H%x09%P%x09%aN%x09%aI%x09%s"}
	if revision == "" {
		args = append(args, "--all")
	} else {
		args = append(args, "--end-of-options", revision)
	}
	output, err := run(ctx, r.root, args...)
	if err != nil {
		return nil, err
	}
	commits := []overview.BranchCommit{}
	for _, line := range strings.Split(strings.TrimSpace(output), "\n") {
		if line == "" {
			continue
		}
		fields := strings.SplitN(line, "\t", 5)
		if len(fields) != 5 {
			return nil, fmt.Errorf("parse branch commit: expected 5 fields")
		}
		parents := strings.Fields(fields[1])
		if parents == nil {
			parents = []string{}
		}
		commits = append(commits, overview.BranchCommit{OID: fields[0], Parents: parents, Author: fields[2], AuthoredAt: fields[3], Subject: fields[4], Refs: []string{}})
	}
	return commits, nil
}

func (r *Repository) WorkingTree(ctx context.Context) (overview.WorkingTree, error) {
	status, err := run(ctx, r.root, "status", "--porcelain=v1", "-z", "--untracked-files=all")
	if err != nil {
		return overview.WorkingTree{}, err
	}
	files := []string{}
	untracked := []string{}
	entries := strings.Split(status, "\x00")
	for index := 0; index < len(entries); index++ {
		entry := entries[index]
		if len(entry) < 4 {
			continue
		}
		file := entry[3:]
		files = append(files, file)
		if entry[:2] == "??" {
			untracked = append(untracked, file)
		}
		if (entry[0] == 'R' || entry[0] == 'C' || entry[1] == 'R' || entry[1] == 'C') && index+1 < len(entries) {
			index++
		}
	}
	patch, err := run(ctx, r.root, "diff", "HEAD", "--no-color", "--no-ext-diff", "--find-renames", "--unified=3")
	if err != nil {
		return overview.WorkingTree{}, err
	}
	for _, file := range untracked {
		untrackedDiff, diffErr := r.untrackedPatch(ctx, file)
		if diffErr != nil {
			return overview.WorkingTree{}, diffErr
		}
		if patch != "" && !strings.HasSuffix(patch, "\n") {
			patch += "\n"
		}
		patch += untrackedDiff
	}
	return overview.WorkingTree{Dirty: len(files) > 0, Files: files, Patch: patch, PatchFiles: overview.ParsePatchFiles(patch)}, nil
}

func (r *Repository) untrackedPatch(ctx context.Context, file string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", "-C", r.root, "diff", "--no-index", "--no-color", "--no-ext-diff", "--unified=3", "--", "/dev/null", file)
	output, err := cmd.Output()
	if err == nil {
		return string(output), nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) && exitErr.ExitCode() == 1 {
		return string(output), nil
	}
	return "", commandError(cmd, err)
}

func (r *Repository) CommitsBetween(ctx context.Context, fromOID, toOID, path string, destination io.Writer) error {
	args := []string{"-C", r.root, "log", fromOID + ".." + toOID, "--use-mailmap", "--date=iso-strict", "--format=%x1e%H%x1f%aN%x1f%aE%x1f%aI%x1f%s", "--numstat"}
	if path != "" {
		args = append(args, "--", ":(literal)"+path)
	}
	cmd := exec.CommandContext(ctx, "git", args...)
	var stderr bytes.Buffer
	cmd.Stdout = destination
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if message := strings.TrimSpace(stderr.String()); message != "" {
			return fmt.Errorf("git failed: %s: %w", message, err)
		}
		return commandError(cmd, err)
	}
	return nil
}

func withinPath(candidate, scope string) bool {
	if scope == "" {
		return true
	}
	scope = strings.TrimSuffix(scope, "/")
	return candidate == scope || strings.HasPrefix(candidate, scope+"/")
}

func run(ctx context.Context, dir string, args ...string) (string, error) {
	cmdArgs := append([]string{"-C", dir}, args...)
	cmd := exec.CommandContext(ctx, "git", cmdArgs...)
	output, err := cmd.Output()
	if err != nil {
		return "", commandError(cmd, err)
	}
	return string(output), nil
}

func commandError(cmd *exec.Cmd, err error) error {
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		message := strings.TrimSpace(string(exitErr.Stderr))
		if message != "" {
			return fmt.Errorf("git failed: %s: %w", message, err)
		}
	}
	return fmt.Errorf("run git: %w", err)
}
