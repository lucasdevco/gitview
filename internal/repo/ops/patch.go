package ops

import (
	"regexp"
	"strconv"
	"strings"
)

// filePatch is one file's unified diff split into its header lines and its
// hunks. Lines keep their trailing newline so a rebuilt patch is
// byte-for-byte git's own text.
type filePatch struct {
	header []string
	hunks  []patchHunk
	// combined is set for a conflicted file's combined diff (diff --cc),
	// which git apply cannot apply.
	combined bool
}

// patchHunk is one hunk: its @@ line and body, including any
// "\ No newline at end of file" markers.
type patchHunk struct {
	HunkRange
	lines []string
}

var hunkHeader = regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)

// parsePatch splits a single-file patch. Each hunk consumes exactly the
// number of lines its header announces, so content lines that look like
// headers (a removed "-- comment") stay in their hunk.
func parsePatch(text string) filePatch {
	var patch filePatch
	var current *patchHunk
	oldLeft, newLeft := 0, 0
	for _, line := range strings.SplitAfter(text, "\n") {
		if line == "" {
			continue
		}
		switch {
		case strings.HasPrefix(line, `\`):
			// Describes the line before it, so it belongs to the same hunk.
			if current != nil {
				current.lines = append(current.lines, line)
			}
		case current != nil && (oldLeft > 0 || newLeft > 0):
			current.lines = append(current.lines, line)
			switch line[0] {
			case '-':
				oldLeft--
			case '+':
				newLeft--
			default:
				oldLeft--
				newLeft--
			}
		default:
			match := hunkHeader.FindStringSubmatch(line)
			if match == nil {
				if strings.HasPrefix(line, "diff --cc ") || strings.HasPrefix(line, "@@@") {
					patch.combined = true
				}
				if len(patch.hunks) == 0 {
					patch.header = append(patch.header, line)
				}
				continue
			}
			hunk := patchHunk{HunkRange: HunkRange{
				OldStart: atoi(match[1]), OldCount: count(match[2]),
				NewStart: atoi(match[3]), NewCount: count(match[4]),
			}, lines: []string{line}}
			patch.hunks = append(patch.hunks, hunk)
			current = &patch.hunks[len(patch.hunks)-1]
			oldLeft, newLeft = hunk.OldCount, hunk.NewCount
		}
	}
	return patch
}

func atoi(text string) int {
	n, _ := strconv.Atoi(text)
	return n
}

// count reads a hunk range's line count, which git omits when it is 1.
func count(text string) int {
	if text == "" {
		return 1
	}
	return atoi(text)
}

// single returns a patch of the file header and one hunk. A rename or copy
// becomes a change to the new path alone, so applying one hunk to the index
// (or reversing it) never moves the file.
func (p filePatch) single(hunk patchHunk) []byte {
	var b strings.Builder
	for _, line := range p.renameAsModification() {
		b.WriteString(line)
	}
	for _, line := range hunk.lines {
		b.WriteString(line)
	}
	return []byte(b.String())
}

func (p filePatch) renameAsModification() []string {
	renamed := false
	newName := ""
	for _, line := range p.header {
		if strings.HasPrefix(line, "rename from ") || strings.HasPrefix(line, "copy from ") {
			renamed = true
		}
		if name, ok := strings.CutPrefix(line, "+++ "); ok {
			newName = strings.TrimSuffix(name, "\n")
		}
	}
	if !renamed || newName == "" {
		return p.header
	}
	// The new name is "b/path" or, for unusual characters, "\"b/path\"".
	oldName := strings.Replace(newName, "b/", "a/", 1)
	header := []string{"diff --git " + oldName + " " + newName + "\n"}
	for _, line := range p.header[1:] {
		switch {
		case strings.HasPrefix(line, "similarity index "), strings.HasPrefix(line, "dissimilarity index "),
			strings.HasPrefix(line, "rename from "), strings.HasPrefix(line, "rename to "),
			strings.HasPrefix(line, "copy from "), strings.HasPrefix(line, "copy to "):
		case strings.HasPrefix(line, "--- "):
			header = append(header, "--- "+oldName+"\n")
		default:
			header = append(header, line)
		}
	}
	return header
}
