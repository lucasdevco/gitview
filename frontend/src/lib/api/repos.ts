import type { ApiClient } from "./client"

/** An open repository. `id` is used in every per-repository API path. */
export type RepoEntry = {
  id: string
  name: string
  root: string
}

export type RepoState = "clean" | "merging" | "rebasing" | "cherry-picking" | "reverting"

export type RepoSummary = RepoEntry & {
  /** Short name of the checked-out branch; empty when HEAD is detached. */
  branch: string
  detached: boolean
  /** Commit HEAD points to; empty when the repository has no commits yet. */
  head: string
  empty: boolean
  state: RepoState
  identity: { name: string; email: string }
}

/** Path of a per-repository API resource: /api/v1/repos/{repoId}/... */
export function repoPath(repoId: string, ...segments: string[]): string {
  return ["/api/v1/repos", repoId, ...segments]
    .map((part, index) => (index ? encodeURIComponent(part) : part))
    .join("/")
}

export function listRepos(client: ApiClient, signal?: AbortSignal): Promise<RepoEntry[]> {
  return client.get("/api/v1/repos", signal)
}

export function getRepoSummary(client: ApiClient, repoId: string, signal?: AbortSignal): Promise<RepoSummary> {
  return client.get(repoPath(repoId), signal)
}
