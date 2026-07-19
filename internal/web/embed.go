package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist all:fallback
var assetFS embed.FS

// Assets returns the compiled frontend when it is present, or a tracked
// placeholder page so backend-only builds do not depend on generated files.
func Assets() (fs.FS, error) {
	dist, err := fs.Sub(assetFS, "dist")
	if err == nil {
		if _, statErr := fs.Stat(dist, "index.html"); statErr == nil {
			return dist, nil
		}
	}
	return fs.Sub(assetFS, "fallback")
}
