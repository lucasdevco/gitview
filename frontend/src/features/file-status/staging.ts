// Rules of the file status view's checkboxes, hunk buttons and commit button.
import type { DiffHunk } from "@/features/diff/parse-diff"
import type { FilesRequest, HunkRequest } from "@/lib/api/operations"
import type { FileChange, WorktreeStatus } from "@/lib/api/worktree"

export type Area = "staged" | "unstaged"

/** Number of distinct changed paths: the 提交 button's badge. */
export function pendingFileCount(status?: WorktreeStatus): number {
  if (!status) return 0
  const paths = new Set<string>()
  for (const list of [status.staged, status.unstaged, status.untracked, status.conflicted]) {
    for (const change of list) paths.add(change.path)
  }
  return paths.size
}

/**
 * The operation that moves `files` out of `area`: unstaged files are staged,
 * staged files unstaged, and a staged rename unstages both of its paths.
 * Staging a conflicted file marks its conflict resolved with whatever the
 * file now contains; `resolves` names those files so the view can confirm
 * first.
 */
export function toggleRequest(
  area: Area,
  files: readonly FileChange[],
): { op: "stage" | "unstage"; request: FilesRequest; resolves: string[] } | undefined {
  if (!files.length) return undefined
  if (area === "staged") {
    const paths = files.flatMap((file) => (file.oldPath ? [file.path, file.oldPath] : [file.path]))
    return { op: "unstage", request: { paths }, resolves: [] }
  }
  return {
    op: "stage",
    request: { paths: files.map((file) => file.path) },
    resolves: files.filter((file) => file.status === "conflicted").map((file) => file.path),
  }
}

export type HunkOperation = "stageHunk" | "unstageHunk" | "discardHunk"

/**
 * The buttons in each hunk header of a file listed in `area`: 暂存区块 and
 * 丢弃区块 for unstaged and untracked files, 取消暂存区块 for staged ones.
 * Conflicted files have none; their hunks are resolved, not staged.
 */
export function hunkOperations(area: Area, file: FileChange): HunkOperation[] {
  if (area === "staged") return ["unstageHunk"]
  if (file.status === "conflicted") return []
  return ["stageHunk", "discardHunk"]
}

/** The request naming `hunk` of the diff shown for `file` in `area`. */
export function hunkRequest(file: FileChange, area: Area, hunk: DiffHunk): HunkRequest {
  const range = {
    oldStart: hunk.oldStart,
    oldCount: hunk.oldCount,
    newStart: hunk.newStart,
    newCount: hunk.newCount,
  }
  if (area === "staged" && file.oldPath) return { path: file.path, oldPath: file.oldPath, hunk: range }
  return { path: file.path, hunk: range }
}

/**
 * Whether the commit button is enabled. Nothing can be committed while a
 * file is conflicted; a merge can be concluded once none is, even when its
 * result matches the current branch and nothing is staged.
 */
export function canCommit({
  stagedCount,
  message,
  amend,
  empty,
  merging = false,
  conflictedCount = 0,
}: {
  stagedCount: number
  message: string
  amend: boolean
  /** The repository has no commits yet. */
  empty: boolean
  /** A merge is in progress; committing concludes it. */
  merging?: boolean
  conflictedCount?: number
}): boolean {
  if (!message.trim() || conflictedCount > 0) return false
  if (amend) return !empty && !merging
  return merging || stagedCount > 0
}
