package gitrepo

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"

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

func (r *Repository) Commits(ctx context.Context) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "git", "-C", r.root, "log", "HEAD", "--root", "--use-mailmap", "--date=iso-strict", "--format=%x1e%H%x1f%aN%x1f%aE%x1f%aI%x1f%s", "--numstat")
	output, err := cmd.Output()
	if err != nil {
		return nil, commandError(cmd, err)
	}
	return output, nil
}

func (r *Repository) IsShallow(ctx context.Context) (bool, error) {
	value, err := run(ctx, r.root, "rev-parse", "--is-shallow-repository")
	return strings.TrimSpace(value) == "true", err
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
