import { expect, test } from "vitest"
import { parseDiff } from "./parse-diff.ts"
import { findDiffMatches } from "./search.ts"

const hunks = parseDiff(`@@ -1,2 +1,2 @@
-const Value = value
+const value = VALUE + value
 done
@@ -9 +9 @@
-nothing here
+values
`)

test("finds every case-insensitive occurrence in reading order", () => {
  expect(findDiffMatches(hunks, "value")).toEqual([
    { hunk: 0, line: 0, start: 6, end: 11 },
    { hunk: 0, line: 0, start: 14, end: 19 },
    { hunk: 0, line: 1, start: 6, end: 11 },
    { hunk: 0, line: 1, start: 14, end: 19 },
    { hunk: 0, line: 1, start: 22, end: 27 },
    { hunk: 1, line: 1, start: 0, end: 5 },
  ])
})

test("occurrences do not overlap", () => {
  const [hunk] = parseDiff("@@ -0,0 +1 @@\n+aaaa\n")
  expect(findDiffMatches(hunk ? [hunk] : [], "aa")).toEqual([
    { hunk: 0, line: 0, start: 0, end: 2 },
    { hunk: 0, line: 0, start: 2, end: 4 },
  ])
})

test("an empty query matches nothing", () => {
  expect(findDiffMatches(hunks, "")).toEqual([])
})

test("a query with no occurrence matches nothing", () => {
  expect(findDiffMatches(hunks, "absent")).toEqual([])
})
