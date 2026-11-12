// History graph and refs: GET /api/v1/repos/{repoId}/graph and /refs.
import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import type { ApiClient } from "./client"
import { repoPath } from "./repos"

/** One commit of the history graph. Times are Unix seconds. */
export type GraphCommit = {
  oid: string
  /** First parent first; empty for a root commit. */
  parents: string[]
  author: string
  email: string
  authorTime: number
  commitTime: number
  subject: string
}

export type GraphOptions = {
  /** Every branch, tag and HEAD, or only the history of HEAD. */
  scope: "all" | "current"
  /** Include commits reachable only from remote-tracking branches. */
  remotes: boolean
}

export type Branch = {
  /** Short name, e.g. "feature/login". */
  name: string
  oid: string
  current: boolean
  /** Tracked branch, e.g. "origin/main"; empty when untracked. */
  upstream: string
  ahead: number
  behind: number
  upstreamGone: boolean
}

export type RemoteBranch = {
  /** Includes the remote, e.g. "origin/main". */
  name: string
  /** Name on the remote, e.g. "main". */
  branch: string
  oid: string
}

export type Remote = {
  name: string
  /** Where the remote fetches from, any password in it replaced by "xxxxx". */
  url: string
  branches: RemoteBranch[]
}

/** A tag; `oid` is the commit it points to (annotated tags resolved). */
export type Tag = { name: string; oid: string }

export type Refs = { branches: Branch[]; remotes: Remote[]; tags: Tag[] }

export function getGraph(
  client: ApiClient,
  repoId: string,
  options: GraphOptions,
  signal?: AbortSignal,
): Promise<GraphCommit[]> {
  const params = new URLSearchParams({ scope: options.scope, remotes: String(options.remotes) })
  return client.get(`${repoPath(repoId, "graph")}?${params}`, signal)
}

export function getRefs(client: ApiClient, repoId: string, signal?: AbortSignal): Promise<Refs> {
  return client.get(repoPath(repoId, "refs"), signal)
}

/**
 * Query keys: ["repos", id, "graph", options] and ["repos", id, "refs"].
 * Invalidate ["repos", id, "graph"] to refetch every graph variant.
 */
export const historyKeys = {
  graphs: (repoId: string) => ["repos", repoId, "graph"] as const,
  graph: (repoId: string, options: GraphOptions) => ["repos", repoId, "graph", options] as const,
  refs: (repoId: string) => ["repos", repoId, "refs"] as const,
}

export function graphQuery(client: ApiClient, repoId: string, options: GraphOptions) {
  return queryOptions({
    queryKey: historyKeys.graph(repoId, options),
    queryFn: ({ signal }) => getGraph(client, repoId, options, signal),
    // Keep showing the previous graph while another scope loads.
    placeholderData: keepPreviousData,
  })
}

export function refsQuery(client: ApiClient, repoId: string) {
  return queryOptions({
    queryKey: historyKeys.refs(repoId),
    queryFn: ({ signal }) => getRefs(client, repoId, signal),
  })
}
