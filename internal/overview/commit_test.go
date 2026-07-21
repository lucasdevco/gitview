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
	if len(commit.PatchFiles) != 1 || commit.PatchFiles[0].Path != "parser.go" || commit.PatchFiles[0].Patch == "" {
		t.Fatalf("unexpected patch files: %+v", commit.PatchFiles)
	}
}

func TestParsePatchFilesDecodesQuotedAndRenamedPaths(t *testing.T) {
	patch := "diff --git \"a/tab\\tfile.go\" \"b/tab\\tfile.go\"\n" +
		"--- \"a/tab\\tfile.go\"\n+++ \"b/tab\\tfile.go\"\n@@ -1 +1 @@\n-old\n+new\n" +
		"diff --git a/old name.go b/new name.go\nsimilarity index 100%\nrename from old name.go\nrename to new name.go\n" +
		"diff --git \"a/image\\told.png\" \"b/image\\tnew.png\"\nindex 123..456 100644\nBinary files \"a/image\\told.png\" and \"b/image\\tnew.png\" differ\n"
	files := ParsePatchFiles(patch)
	if len(files) != 3 {
		t.Fatalf("unexpected files: %+v", files)
	}
	if files[0].Path != "tab\tfile.go" || files[0].OldPath != "tab\tfile.go" || files[0].Status != "modified" {
		t.Fatalf("quoted path was not decoded: %+v", files[0])
	}
	if files[1].Path != "new name.go" || files[1].OldPath != "old name.go" || files[1].Status != "renamed" {
		t.Fatalf("rename paths were not decoded: %+v", files[1])
	}
	if files[2].Path != "image\tnew.png" || files[2].OldPath != "image\told.png" {
		t.Fatalf("binary paths were not decoded: %+v", files[2])
	}
}
