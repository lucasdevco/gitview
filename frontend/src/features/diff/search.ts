import type { DiffHunk } from "./parse-diff"

/** One occurrence of the search text: hunk and line indexes, character range in the line's text. */
export type DiffMatch = { hunk: number; line: number; start: number; end: number }

/** Finds every case-insensitive, non-overlapping occurrence of `query` in the diff's line text. */
export function findDiffMatches(hunks: DiffHunk[], query: string): DiffMatch[] {
  const needle = query.toLowerCase()
  if (!needle) return []
  const matches: DiffMatch[] = []
  hunks.forEach((hunk, hunkIndex) => {
    hunk.lines.forEach((line, lineIndex) => {
      const haystack = line.text.toLowerCase()
      for (let start = haystack.indexOf(needle); start >= 0; start = haystack.indexOf(needle, start + needle.length)) {
        matches.push({ hunk: hunkIndex, line: lineIndex, start, end: start + needle.length })
      }
    })
  })
  return matches
}
