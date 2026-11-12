// One commit's details and its file diffs: GET .../commits/{oid} and GET .../diff?source=commit.
import { queryOptions } from "@tanstack/react-query"
import type { ApiClient } from "./client"
import type { GraphCommit } from "./history"
import { repoKeys } from "./queries"
import { repoPath } from "./repos"
import { type DiffRequest, type FileChange, getFileDiff } from "./worktree"

export type CommitDetails = GraphCommit & {
  /** Message after the subject line; empty for a one-line message. */
  body: string
  /**
   * Files the commit changed. A merge commit is compared with its first
   * parent, so this is empty when the merge brought in no changes.
   */
  files: FileChange[]
}

/** The diff of one file of a commit, against the commit's first parent. */
export function commitDiffRequest(oid: string, file: FileChange): DiffRequest {
  return { source: "commit", commit: oid, path: file.path, oldPath: file.oldPath }
}

/**
 * Query keys: ["repos", id, "commit", oid] and ["repos", id, "commit", oid,
 * "diff", path, oldPath]. A commit never changes, so these never need
 * invalidating.
 */
export const commitKeys = {
  commit: (repoId: string, oid: string) => [...repoKeys.repo(repoId), "commit", oid] as const,
  diff: (repoId: string, oid: string, file: FileChange) =>
    [...repoKeys.repo(repoId), "commit", oid, "diff", file.path, file.oldPath ?? ""] as const,
}

export function getCommit(
  client: ApiClient,
  repoId: string,
  oid: string,
  signal?: AbortSignal,
): Promise<CommitDetails> {
  return client.get(repoPath(repoId, "commits", oid), signal)
}

export function commitQuery(client: ApiClient, repoId: string, oid: string) {
  return queryOptions({
    queryKey: commitKeys.commit(repoId, oid),
    queryFn: ({ signal }) => getCommit(client, repoId, oid, signal),
    staleTime: Number.POSITIVE_INFINITY,
  })
}

export function commitFileDiffQuery(client: ApiClient, repoId: string, oid: string, file: FileChange) {
  return queryOptions({
    queryKey: commitKeys.diff(repoId, oid, file),
    queryFn: ({ signal }) => getFileDiff(client, repoId, commitDiffRequest(oid, file), signal),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
