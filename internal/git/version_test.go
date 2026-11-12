package git_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"gitview/internal/git"
)

func TestRequireVersionAcceptsSupportedGit(t *testing.T) {
	for _, output := range []string{
		"git version 2.32.0",
		"git version 2.50.1 (Apple Git-155)",
		"git version 2.45.2.windows.1",
		"git version 3.0.0",
	} {
		runner := git.NewRunner(t.TempDir(), git.WithExecutable(fakeGit(t, "echo '"+output+"'\n")))
		version, err := git.RequireVersion(context.Background(), runner)
		if err != nil {
			t.Fatalf("%q: %v", output, err)
		}
		if !strings.HasPrefix(output, "git version "+version.String()) {
			t.Fatalf("%q parsed as %s", output, version)
		}
	}
}

func TestRequireVersionRejectsOldGitWithUpgradeAdvice(t *testing.T) {
	runner := git.NewRunner(t.TempDir(), git.WithExecutable(fakeGit(t, "echo 'git version 2.31.9'\n")))
	_, err := git.RequireVersion(context.Background(), runner)
	if !errors.Is(err, git.UnsupportedVersion) {
		t.Fatalf("expected UnsupportedVersion, got %v", err)
	}
	message := err.Error()
	for _, want := range []string{"2.31.9", git.MinimumVersion.String(), "upgrade"} {
		if !strings.Contains(message, want) {
			t.Fatalf("message %q should mention %q", message, want)
		}
	}
}

func TestRequireVersionRejectsUnrecognizedOutput(t *testing.T) {
	runner := git.NewRunner(t.TempDir(), git.WithExecutable(fakeGit(t, "echo 'hello'\n")))
	if _, err := git.RequireVersion(context.Background(), runner); err == nil {
		t.Fatal("expected an error for unrecognized version output")
	}
}

func TestRequireVersionReportsMissingGit(t *testing.T) {
	runner := git.NewRunner(t.TempDir(), git.WithExecutable("/nonexistent/git"))
	if _, err := git.RequireVersion(context.Background(), runner); !errors.Is(err, git.NotInstalled) {
		t.Fatalf("expected NotInstalled, got %v", err)
	}
}

func TestInstalledGitIsSupported(t *testing.T) {
	if _, err := git.RequireVersion(context.Background(), git.NewRunner(t.TempDir())); err != nil {
		t.Fatal(err)
	}
}
