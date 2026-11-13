import { expect, test } from "vitest"
import { describeParents, parseDiff } from "./parse-diff.ts"

const modified = `diff --git a/notes.txt b/notes.txt
index 5626abf..f719efd 100644
--- a/notes.txt
+++ b/notes.txt
@@ -1,4 +1,4 @@ section
 one
-two
+TWO
 three
 four
@@ -10,2 +10,3 @@
 ten
+ten and a half
 eleven
`

test("hunk headers give the block number and the new-side line range", () => {
  const hunks = parseDiff(modified)
  expect(hunks.map(({ index, from, to, header }) => ({ index, from, to, header }))).toEqual([
    { index: 1, from: 1, to: 4, header: "@@ -1,4 +1,4 @@ section" },
    { index: 2, from: 10, to: 12, header: "@@ -10,2 +10,3 @@" },
  ])
})

test("lines carry their kind and old/new line numbers", () => {
  const [first, second] = parseDiff(modified)
  expect(first?.lines).toEqual([
    { kind: "context", text: "one", oldNo: 1, newNo: 1 },
    { kind: "del", text: "two", oldNo: 2 },
    { kind: "add", text: "TWO", newNo: 2 },
    { kind: "context", text: "three", oldNo: 3, newNo: 3 },
    { kind: "context", text: "four", oldNo: 4, newNo: 4 },
  ])
  expect(second?.lines).toEqual([
    { kind: "context", text: "ten", oldNo: 10, newNo: 10 },
    { kind: "add", text: "ten and a half", newNo: 11 },
    { kind: "context", text: "eleven", oldNo: 11, newNo: 12 },
  ])
})

test("a new file is one block of added lines numbered from 1", () => {
  const hunks = parseDiff(`diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..b1e6722
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+first
+second
`)
  expect(hunks).toHaveLength(1)
  expect(hunks[0]).toMatchObject({ index: 1, from: 1, to: 2 })
  expect(hunks[0]?.lines).toEqual([
    { kind: "add", text: "first", newNo: 1 },
    { kind: "add", text: "second", newNo: 2 },
  ])
})

test("a deleted file is one block of deleted lines, ranged on the old side", () => {
  const hunks = parseDiff(`diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index b1e6722..0000000
--- a/gone.txt
+++ /dev/null
@@ -1,3 +0,0 @@
-a
-b
-c
`)
  expect(hunks[0]).toMatchObject({ from: 1, to: 3 })
  expect(hunks[0]?.lines).toEqual([
    { kind: "del", text: "a", oldNo: 1 },
    { kind: "del", text: "b", oldNo: 2 },
    { kind: "del", text: "c", oldNo: 3 },
  ])
})

test("a single-line hunk header without counts covers one line", () => {
  const [hunk] = parseDiff("@@ -5 +5 @@\n-x\n+y\n")
  expect(hunk).toMatchObject({ from: 5, to: 5, oldCount: 1, newCount: 1 })
  expect(hunk?.lines).toEqual([
    { kind: "del", text: "x", oldNo: 5 },
    { kind: "add", text: "y", newNo: 5 },
  ])
})

test("'no newline at end of file' marks the line before it instead of adding a line", () => {
  const [hunk] = parseDiff(`--- a/f
+++ b/f
@@ -1,2 +1,2 @@
 keep
-old end
\\ No newline at end of file
+new end
\\ No newline at end of file
`)
  expect(hunk?.lines).toEqual([
    { kind: "context", text: "keep", oldNo: 1, newNo: 1 },
    { kind: "del", text: "old end", oldNo: 2, noNewline: true },
    { kind: "add", text: "new end", newNo: 2, noNewline: true },
  ])
})

test("content that looks like a file header is kept as content", () => {
  const [hunk] = parseDiff(`--- a/schema.sql
+++ b/schema.sql
@@ -1,2 +1,2 @@
--- old comment
+++ new comment
 select 1;
`)
  expect(hunk?.lines).toEqual([
    { kind: "del", text: "-- old comment", oldNo: 1 },
    { kind: "add", text: "++ new comment", newNo: 1 },
    { kind: "context", text: "select 1;", oldNo: 2, newNo: 2 },
  ])
})

test("the trailing newline of the patch does not add a phantom line", () => {
  const [hunk] = parseDiff("@@ -1 +1,2 @@\n a\n+b\n")
  expect(hunk?.lines).toHaveLength(2)
})

test("an empty context line printed without its leading space still counts", () => {
  const [hunk] = parseDiff("@@ -1,3 +1,3 @@\n a\n\n-c\n+C\n")
  expect(hunk?.lines).toEqual([
    { kind: "context", text: "a", oldNo: 1, newNo: 1 },
    { kind: "context", text: "", oldNo: 2, newNo: 2 },
    { kind: "del", text: "c", oldNo: 3 },
    { kind: "add", text: "C", newNo: 3 },
  ])
})

test("a patch without hunks (binary, pure rename, mode change) has no blocks", () => {
  expect(parseDiff("")).toEqual([])
  expect(
    parseDiff(`diff --git a/a.txt b/b.txt
similarity index 100%
rename from a.txt
rename to b.txt
`),
  ).toEqual([])
})

const conflicted = `diff --cc f
index 1e8e5b4,8b6c9ac..0000000
--- a/f
+++ b/f
@@@ -1,3 -1,3 +1,7 @@@
  a
++<<<<<<< HEAD
 +main
++=======
+ other
++>>>>>>> other
  z
`

test("a conflicted file's combined diff keeps each line's per-parent markers and numbers lines in the working tree file", () => {
  const [hunk] = parseDiff(conflicted)
  expect(hunk).toMatchObject({ index: 1, from: 1, to: 7, oldStart: 1, oldCount: 3 })
  // No old line numbers: each parent numbers its lines differently.
  expect(hunk?.lines).toEqual([
    { kind: "context", parents: "  ", text: "a", newNo: 1 },
    { kind: "add", parents: "++", text: "<<<<<<< HEAD", newNo: 2 },
    { kind: "context", parents: " +", text: "main", newNo: 3 },
    { kind: "add", parents: "++", text: "=======", newNo: 4 },
    { kind: "context", parents: "+ ", text: "other", newNo: 5 },
    { kind: "add", parents: "++", text: ">>>>>>> other", newNo: 6 },
    { kind: "context", parents: "  ", text: "z", newNo: 7 },
  ])
})

test("a combined diff's lines removed from a parent are deletions marked with that parent", () => {
  const [hunk] = parseDiff(`diff --cc f
@@@ -1,2 -1,2 +1,2 @@@
  a
- b
 -c
++d
`)
  expect(hunk?.lines).toEqual([
    { kind: "context", parents: "  ", text: "a", newNo: 1 },
    { kind: "del", parents: "- ", text: "b" },
    { kind: "del", parents: " -", text: "c" },
    { kind: "add", parents: "++", text: "d", newNo: 2 },
  ])
})

test("combined diff markers are explained per parent", () => {
  expect(describeParents("++")).toBe("HEAD 和另一方都没有这一行")
  expect(describeParents(" +")).toBe("来自 HEAD（另一方没有这一行）")
  expect(describeParents("+ ")).toBe("来自另一方（HEAD 没有这一行）")
  expect(describeParents("  ")).toBe("HEAD 和另一方都有这一行")
  expect(describeParents("- ")).toBe("已从 HEAD 的版本中删除")
  expect(describeParents(" -")).toBe("已从另一方的版本中删除")
})
