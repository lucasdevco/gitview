package main

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"gitview/internal/git"
	"gitview/internal/gittest"
)

var openURL = regexp.MustCompile(`^Open (http://127\.0\.0\.1:\d+/)$`)

func TestServePrintsAPlainURLThatOpensTheAPI(t *testing.T) {
	r := gittest.Init(t)
	r.Commit("a.txt", "a\n", "first")
	reader, writer := io.Pipe()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- serve(ctx, serveConfig{Repository: r.Dir, Port: 0, Stdout: writer})
		_ = writer.Close()
	}()

	base := waitForURL(t, reader)
	go func() { _, _ = io.Copy(io.Discard, reader) }()

	if status := apiStatus(t, base+"api/v1/repos", nil); status != http.StatusOK {
		t.Fatalf("request from this machine: status %d", status)
	}
	if status := apiStatus(t, base+"api/v1/repos", http.Header{"Origin": {"https://evil.example"}}); status != http.StatusForbidden {
		t.Fatalf("request from another site: status %d", status)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("serve returned %v after shutdown", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("serve did not shut down")
	}
}

func TestServeExplainsANonRepositoryPath(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("GIT_CEILING_DIRECTORIES", filepath.Dir(dir))

	err := serve(context.Background(), serveConfig{Repository: dir, Port: 0, Stdout: io.Discard})
	if !errors.Is(err, git.NotRepository) || !strings.Contains(err.Error(), "git init") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestServeRefusesAnOldGit(t *testing.T) {
	r := gittest.Init(t)
	bin := t.TempDir()
	script := "#!/bin/sh\necho 'git version 2.20.1'\n"
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

	err := serve(context.Background(), serveConfig{Repository: r.Dir, Port: 0, Stdout: io.Discard})
	if !errors.Is(err, git.UnsupportedVersion) || !strings.Contains(err.Error(), git.MinimumVersion.String()) {
		t.Fatalf("unexpected error: %v", err)
	}
}

func waitForURL(t *testing.T, output io.Reader) (base string) {
	t.Helper()
	found := make(chan []string, 1)
	go func() {
		scanner := bufio.NewScanner(output)
		for scanner.Scan() {
			if match := openURL.FindStringSubmatch(scanner.Text()); match != nil {
				found <- match
				return
			}
		}
		found <- nil
	}()
	select {
	case match := <-found:
		if match == nil {
			t.Fatal("serve did not print an Open URL")
		}
		return match[1]
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for the Open URL")
	}
	return ""
}

func apiStatus(t *testing.T, url string, header http.Header) int {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	for name, values := range header {
		request.Header[name] = values
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	return response.StatusCode
}
