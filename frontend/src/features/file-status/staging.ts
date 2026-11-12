// Rules of the file status view's checkboxes and commit button.
import type { FilesRequest } from "@/lib/api/operations"
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
 * staged files unstaged. Conflicted files are skipped (staging one marks the
 * conflict resolved), and a staged rename unstages both of its paths.
 */
export function toggleRequest(
  area: Area,
  files: readonly FileChange[],
): { op: "stage" | "unstage"; request: FilesRequest } | undefined {
  const paths =
    area === "staged"
      ? files.flatMap((file) => (file.oldPath ? [file.path, file.oldPath] : [file.path]))
      : files.filter((file) => file.status !== "conflicted").map((file) => file.path)
  if (!paths.length) return undefined
  return { op: area === "staged" ? "unstage" : "stage", request: { paths } }
}

/** Whether the commit button is enabled. */
export function canCommit({
  stagedCount,
  message,
  amend,
  empty,
}: {
  stagedCount: number
  message: string
  amend: boolean
  /** The repository has no commits yet. */
  empty: boolean
}): boolean {
  if (!message.trim()) return false
  if (amend) return !empty
  return stagedCount > 0
}
