// The stash list, one stash's files and their diffs: GET .../stashes,
// GET .../stashes/{index} and GET .../diff?source=stash.
import { queryOptions } from "@tanstack/react-query"
import type { ApiClient } from "./client"
import { repoKeys } from "./queries"
import { repoPath } from "./repos"
import { type DiffRequest, type FileChange, getFileDiff } from "./worktree"

/** One entry of the stash list, newest first. */
export type Stash = {
  /** Position in the list: 0 is `stash@{0}`, the newest. Shifts when stashes are pushed or dropped. */
  index: number
  /** Reflog name, e.g. `stash@{0}`. */
  name: string
  /** The stash commit; unlike `index` it never changes. */
  oid: string
  /** git's description, e.g. "On main: half-done login" or "WIP on main: 1a2b3c4 Add login". */
  message: string
  /** When the stash was made, in Unix seconds. */
  time: number
}

export type StashDetails = Stash & {
  /** The commit HEAD pointed at when the stash was made. */
  base: string
  /**
   * Tracked files the stash changed relative to `base` (staged and unstaged
   * combined), then the untracked files it saved, with status "untracked".
   */
  files: FileChange[]
}

/** The diff of one file saved in a stash; an untracked file shows as added. */
export function stashDiffRequest(oid: string, file: FileChange): DiffRequest {
  return { source: "stash", commit: oid, path: file.path, oldPath: file.oldPath }
}

/**
 * Query keys: ["repos", id, "stashes"] for the list and every stash, which
 * refresh together, and ["repos", id, "stash", oid, "diff", path, oldPath]
 * for file diffs, which never change.
 */
export const stashKeys = {
  list: (repoId: string) => [...repoKeys.repo(repoId), "stashes"] as const,
  stash: (repoId: string, { index, oid }: Pick<Stash, "index" | "oid">) =>
    [...repoKeys.repo(repoId), "stashes", index, oid] as const,
  diff: (repoId: string, oid: string, file: FileChange) =>
    [...repoKeys.repo(repoId), "stash", oid, "diff", file.path, file.oldPath ?? ""] as const,
}

export function listStashes(client: ApiClient, repoId: string, signal?: AbortSignal): Promise<Stash[]> {
  return client.get(repoPath(repoId, "stashes"), signal)
}

export function getStash(
  client: ApiClient,
  repoId: string,
  index: number,
  signal?: AbortSignal,
): Promise<StashDetails> {
  return client.get(repoPath(repoId, "stashes", String(index)), signal)
}

export function stashesQuery(client: ApiClient, repoId: string) {
  return queryOptions({
    queryKey: stashKeys.list(repoId),
    queryFn: ({ signal }) => listStashes(client, repoId, signal),
  })
}

/**
 * The files of a stash from the list. It fails if the stash at the given
 * index is no longer that stash, rather than showing another stash's files.
 */
export function stashQuery(client: ApiClient, repoId: string, stash: Pick<Stash, "index" | "oid">) {
  return queryOptions({
    queryKey: stashKeys.stash(repoId, stash),
    queryFn: async ({ signal }) => {
      const details = await getStash(client, repoId, stash.index, signal)
      if (details.oid !== stash.oid) throw new Error(`贮藏列表已变化，stash@{${stash.index}} 不再是所选的贮藏。`)
      return details
    },
  })
}

export function stashFileDiffQuery(client: ApiClient, repoId: string, oid: string, file: FileChange) {
  return queryOptions({
    queryKey: stashKeys.diff(repoId, oid, file),
    queryFn: ({ signal }) => getFileDiff(client, repoId, stashDiffRequest(oid, file), signal),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
