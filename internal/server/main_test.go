package server_test

import (
	"os"
	"testing"

	"gitview/internal/askpass"
)

// TestMain lets the test binary stand in for the gitview binary as the
// credential helper: git runs it with the helper's variables set.
func TestMain(m *testing.M) {
	if askpass.Requested(os.Getenv) {
		os.Exit(askpass.Main(os.Args[1:], os.Getenv, os.Stdout, os.Stderr))
	}
	os.Exit(m.Run())
}
