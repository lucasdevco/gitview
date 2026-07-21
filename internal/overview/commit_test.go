package overview

import "testing"

func TestParseCommitPatch(t *testing.T) {
	raw := "\x1eabc123\x1fparent1 parent2\x1fAda\x1fada@example.com\x1f2026-07-21T10:00:00Z\x1fImprove parser\n" +
		"diff --git a/parser.go b/parser.go\n--- a/parser.go\n+++ b/parser.go\n@@ -1 +1,2 @@\n-old\n+new\n+more\n"
	commit, err := parseCommitPatch(raw)
	if err != nil {
		t.Fatal(err)
	}
	if commit.OID != "abc123" || commit.ParentOID != "parent1" || commit.Files != 1 || commit.Additions != 2 || commit.Deletions != 1 {
		t.Fatalf("unexpected commit: %+v", commit)
	}
}
