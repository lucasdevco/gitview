// Working tree status and per-file diffs: GET .../status and GET .../diff.
import { queryOptions } from "@tanstack/react-query"
import type { ApiClient } from "./client"
import { repoKeys } from "./queries"
import { repoPath } from "./repos"

export type ChangeKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "typechanged"
  | "untracked"
  | "conflicted"

/** One changed path. `oldPath` is set for renames and copies. */
export type FileChange = {
  path: string
  oldPath?: string
  status: ChangeKind
}

export type WorktreeStatus = {
  /** HEAD vs. index. */
  staged: FileChange[]
  /** Index vs. working tree, tracked files only. */
  unstaged: FileChange[]
  untracked: FileChange[]
  /** Unmerged paths; not repeated in the other lists. */
  conflicted: FileChange[]
}

/** staged: HEAD vs. index; unstaged: index vs. working tree; untracked: whole file as added. */
export type DiffSource = "staged" | "unstaged" | "untracked"

export type DiffRequest = {
  source: DiffSource
  path: string
  /** Original path of a staged rename, so the diff shows a rename. */
  oldPath?: string
}

export type FileDiff = {
  path: string
  oldPath?: string
  /** Git considers the file binary; `patch` is empty. */
  binary: boolean
  /** The diff exceeds the server's size limit; `patch` is empty. */
  tooLarge: boolean
  /** Unified diff for this one file, headers included; empty when there is no textual change. */
  patch: string
}

/** Which diff to request for a file listed in the given status area. */
export function diffRequestFor(change: FileChange, area: "staged" | "unstaged"): DiffRequest {
  if (area === "staged") return { source: "staged", path: change.path, oldPath: change.oldPath }
  return { source: change.status === "untracked" ? "untracked" : "unstaged", path: change.path }
}

export const worktreeKeys = {
  /** Invalidate on index or working tree changes. */
  status: (repoId: string) => [...repoKeys.repo(repoId), "status"] as const,
  /** Prefix of every diff query of a repository. */
  diffs: (repoId: string) => [...repoKeys.repo(repoId), "diff"] as const,
  diff: (repoId: string, request: DiffRequest) =>
    [...repoKeys.repo(repoId), "diff", request.source, request.path, request.oldPath ?? ""] as const,
}

export function getWorktreeStatus(client: ApiClient, repoId: string, signal?: AbortSignal): Promise<WorktreeStatus> {
  return client.get(repoPath(repoId, "status"), signal)
}

export function getFileDiff(
  client: ApiClient,
  repoId: string,
  request: DiffRequest,
  signal?: AbortSignal,
): Promise<FileDiff> {
  const params = new URLSearchParams({ source: request.source, path: request.path })
  if (request.oldPath) params.set("oldPath", request.oldPath)
  return client.get(`${repoPath(repoId, "diff")}?${params}`, signal)
}

export function worktreeStatusQuery(client: ApiClient, repoId: string) {
  return queryOptions({
    queryKey: worktreeKeys.status(repoId),
    queryFn: ({ signal }) => getWorktreeStatus(client, repoId, signal),
  })
}

export function fileDiffQuery(client: ApiClient, repoId: string, request: DiffRequest) {
  return queryOptions({
    queryKey: worktreeKeys.diff(repoId, request),
    queryFn: ({ signal }) => getFileDiff(client, repoId, request, signal),
  })
}
