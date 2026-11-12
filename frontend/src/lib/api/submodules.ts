// The repository's submodules: GET .../submodules.
import { queryOptions } from "@tanstack/react-query"
import type { ApiClient } from "./client"
import { repoPath } from "./repos"

/** A submodule declared in .gitmodules, with the commit the index records for it. */
export type Submodule = {
  /** Where it is checked out, relative to the repository root. */
  path: string
  /** The submodule commit this repository pins. */
  oid: string
}

/** Query key: ["repos", id, "submodules"]. */
export const submoduleKeys = {
  list: (repoId: string) => ["repos", repoId, "submodules"] as const,
}

export function submodulesQuery(client: ApiClient, repoId: string) {
  return queryOptions({
    queryKey: submoduleKeys.list(repoId),
    queryFn: ({ signal }): Promise<Submodule[]> => client.get(repoPath(repoId, "submodules"), signal),
  })
}
