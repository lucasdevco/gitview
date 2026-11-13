// Parses one file's unified diff (as returned by GET .../diff) into hunks
// with old/new line numbers. Pure: no React, no API.

export type DiffLineKind = "context" | "add" | "del"

export type DiffLine = {
  kind: DiffLineKind
  /** The line's content without its +/-/space prefix. */
  text: string
  /** Line number on the old side; absent for added lines. */
  oldNo?: number
  /** Line number on the new side; absent for deleted lines. */
  newNo?: number
  /** Set on the last line of a side that has no trailing newline. */
  noNewline?: true
  /**
   * Combined diffs (conflicted files) only: one marker per parent, HEAD
   * first — "+" the line is not in that parent, "-" it was removed from
   * it, " " that parent has it. See describeParents.
   */
  parents?: string
}

export type DiffHunk = {
  /** 1-based position of the hunk in the file ("块 N"). */
  index: number
  /** The raw `@@ … @@` header line, including any function context. */
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  /** First and last line the hunk covers, on the new side (the old side for a deletion). */
  from: number
  to: number
  lines: DiffLine[]
}

// `@@ -a,b +c,d @@`, or a combined diff's `@@@ -a,b -c,d +e,f @@@` (conflicted
// files): one "-" range per parent, then the result's "+" range.
const HUNK_HEADER = /^(@{2,}) ((?:-\d+(?:,\d+)? )+)(\+\d+(?:,\d+)?) \1/

type Range = { start: number; count: number }

function parseRange(text: string): Range {
  const [start = "0", count] = text.slice(1).split(",")
  return { start: Number(start), count: count === undefined ? 1 : Number(count) }
}

/** A hunk being read: line counters and how many lines each side still expects. */
type Cursor = { hunk: DiffHunk; oldNo: number; newNo: number; parentsLeft: number[]; newLeft: number }

/**
 * Parses a single-file patch. Header lines before the first hunk are
 * skipped; each hunk consumes exactly the number of lines its header
 * announces, so content that looks like a header (a deleted `-- comment`) is
 * kept and anything after the last hunk is ignored. Lines of combined diffs
 * (conflicted files) keep their per-parent markers and are numbered in the
 * working tree file only.
 */
export function parseDiff(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let cursor: Cursor | undefined

  for (const raw of patch.split("\n")) {
    if (raw.startsWith("\\")) {
      // "\ No newline at end of file" describes the line before it.
      const last = cursor?.hunk.lines.at(-1)
      if (last) last.noNewline = true
      continue
    }
    if (cursor && (cursor.newLeft > 0 || cursor.parentsLeft.some((left) => left > 0))) {
      readLine(cursor, raw)
      continue
    }
    const match = HUNK_HEADER.exec(raw)
    if (!match) continue
    const parents = (match[2] ?? "").trim().split(" ").map(parseRange)
    const old = parents[0] ?? { start: 0, count: 0 }
    const result = parseRange(match[3] ?? "")
    const side = result.count > 0 ? result : old
    const hunk: DiffHunk = {
      index: hunks.length + 1,
      header: raw,
      oldStart: old.start,
      oldCount: old.count,
      newStart: result.start,
      newCount: result.count,
      from: side.start,
      to: side.start + Math.max(side.count - 1, 0),
      lines: [],
    }
    hunks.push(hunk)
    cursor = {
      hunk,
      oldNo: old.start,
      newNo: result.start,
      parentsLeft: parents.map((range) => range.count),
      newLeft: result.count,
    }
  }
  return hunks
}

// Each line starts with one column per parent. A "-" in any column means the
// line was removed: it exists in the parents marked "-". Otherwise it is in
// the result, and in every parent whose column is a space ("+" = new there).
function readLine(cursor: Cursor, raw: string) {
  const width = cursor.parentsLeft.length
  // Some configurations print an empty context line without its space.
  const prefix = raw.slice(0, width).padEnd(width, " ")
  const text = raw.slice(width)
  const removed = prefix.includes("-")
  const inParent = (column: number) => (removed ? prefix[column] === "-" : prefix[column] === " ")
  for (let column = 0; column < width; column++) {
    if (inParent(column)) cursor.parentsLeft[column] = (cursor.parentsLeft[column] ?? 0) - 1
  }
  if (width > 1) {
    cursor.hunk.lines.push(combinedLine(cursor, prefix, text))
    return
  }
  const line: DiffLine = { kind: removed ? "del" : prefix.includes("+") ? "add" : "context", text }
  if (inParent(0)) line.oldNo = cursor.oldNo++
  if (!removed) {
    line.newNo = cursor.newNo++
    cursor.newLeft--
  }
  cursor.hunk.lines.push(line)
}

// A combined diff's line keeps its per-parent markers. It counts as added
// only when no parent has it (conflict markers, new text) and as context when
// some parent has it, so a line taken from one side is not shown as new. It
// is numbered in the result only: every parent numbers its lines differently.
function combinedLine(cursor: Cursor, parents: string, text: string): DiffLine {
  if (parents.includes("-")) return { kind: "del", parents, text }
  cursor.newLeft--
  const kind = [...parents].every((mark) => mark === "+") ? "add" : "context"
  return { kind, parents, text, newNo: cursor.newNo++ }
}

/**
 * Explains a combined diff line's per-parent markers ("+ ", " -", …): which
 * of HEAD and the other side (the branch being merged or the commit being
 * replayed) have the line.
 */
export function describeParents(parents: string): string {
  const width = parents.length
  const name = (column: number) => (column === 0 ? "HEAD" : width === 2 ? "另一方" : `父提交 ${column + 1}`)
  const marked = (mark: string) =>
    [...parents].flatMap((each, column) => (each === mark ? [name(column)] : [])).join("和")
  const [removed, missing, present] = [marked("-"), marked("+"), marked(" ")]
  let text: string
  if (removed) text = `已从${removed}的版本中删除`
  else if (!missing) text = `${present}都有这一行`
  else if (!present) text = `${missing}都没有这一行`
  else text = `来自${present}（${missing}没有这一行）`
  // Space Latin text from Chinese, as elsewhere in the UI.
  return text.replace(/([A-Za-z0-9])(?=[一-鿿])/g, "$1 ").replace(/([一-鿿])(?=[A-Za-z0-9])/g, "$1 ")
}
