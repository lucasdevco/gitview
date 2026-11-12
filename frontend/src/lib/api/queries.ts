import { queryOptions } from "@tanstack/react-query"
import type { ApiClient } from "./client"
import { getRepoSummary, listRepos } from "./repos"

/**
 * Query keys. Every per-repository query starts with ["repos", repoId] so a
 * change event for one repository can invalidate exactly its queries, e.g.
 * ["repos", id, "summary"] when its HEAD or state changes.
 */
export const repoKeys = {
  all: ["repos"] as const,
  repo: (repoId: string) => ["repos", repoId] as const,
  summary: (repoId: string) => ["repos", repoId, "summary"] as const,
}

export function reposQuery(client: ApiClient) {
  return queryOptions({
    queryKey: repoKeys.all,
    queryFn: ({ signal }) => listRepos(client, signal),
  })
}

export function repoSummaryQuery(client: ApiClient, repoId: string) {
  return queryOptions({
    queryKey: repoKeys.summary(repoId),
    queryFn: ({ signal }) => getRepoSummary(client, repoId, signal),
  })
}
