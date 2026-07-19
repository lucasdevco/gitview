package web

import (
	"io/fs"
	"strings"
	"testing"
)

func TestAssetsIncludesIndex(t *testing.T) {
	assets, err := Assets()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fs.ReadFile(assets, "index.html"); err != nil {
		t.Fatal(err)
	}
}

func TestFallbackExplainsHowToBuildFrontend(t *testing.T) {
	fallback, err := fs.Sub(assetFS, "fallback")
	if err != nil {
		t.Fatal(err)
	}
	raw, err := fs.ReadFile(fallback, "index.html")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "make frontend") {
		t.Fatalf("unexpected fallback page: %s", raw)
	}
}
