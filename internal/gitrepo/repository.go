package gitrepo

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"path/filepath"
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
	branch, _ := run(ctx, r.root, "symbolic-ref", "--quiet", "--short", "HEAD")
	head, err := run(ctx, r.root, "rev-parse", "--verify", "HEAD")
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return overview.Repository{Name: filepath.Base(r.root), Root: r.root, Branch: strings.TrimSpace(branch), Empty: true}, nil
		}
		return overview.Repository{}, err
	}
	return overview.Repository{Name: filepath.Base(r.root), Root: r.root, Branch: strings.TrimSpace(branch), Head: strings.TrimSpace(head)}, nil
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

func (r *Repository) GoFiles(ctx context.Context, path string) ([]functionanalysis.SourceFile, error) {
	output, err := run(ctx, r.root, "ls-tree", "-r", "-z", "--name-only", "HEAD")
	if err != nil {
		return nil, err
	}
	files := []functionanalysis.SourceFile{}
	for _, candidate := range strings.Split(output, "\x00") {
		if candidate == "" || !strings.HasSuffix(candidate, ".go") || !withinPath(candidate, path) {
			continue
		}
		content, readErr := run(ctx, r.root, "show", "HEAD:"+candidate)
		if readErr != nil {
			return nil, fmt.Errorf("read %s: %w", candidate, readErr)
		}
		files = append(files, functionanalysis.SourceFile{Path: candidate, Content: []byte(content)})
	}
	return files, nil
}

func (r *Repository) GoHistory(ctx context.Context, path string, destination io.Writer) error {
	args := []string{"-C", r.root, "log", "HEAD", "--root", "--use-mailmap", "--date=iso-strict", "--format=%x1e%H%x1f%aN%x1f%aE%x1f%aI%x1f%s", "-p", "--unified=0", "--no-renames", "--no-prefix", "--"}
	if path != "" {
		args = append(args, ":(literal)"+path)
	} else {
		args = append(args, "*.go")
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
