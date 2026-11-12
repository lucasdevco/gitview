import type { FileChange } from "@/lib/api/worktree"

/** Shortens a long path by dropping its beginning, keeping the file name visible: "…/deep/name.ts". */
export function shortenPath(path: string, max = 42): string {
  const characters = Array.from(path)
  return characters.length > max ? `…${characters.slice(characters.length - max + 1).join("")}` : path
}

/** Full description of a changed path, "old → new" for renames and copies. */
export function describeChange(change: Pick<FileChange, "path" | "oldPath">): string {
  return change.oldPath ? `${change.oldPath} → ${change.path}` : change.path
}
