// Whether write controls must wait for a background job (see writesBlockedBy).
import { useQuery } from "@tanstack/react-query"
import { useApi } from "@/lib/api/context"
import { jobsQuery } from "@/lib/api/jobs"
import { writesBlockedBy } from "./job-status"

/**
 * Why writes to the repository would wait now — a fetch, pull or push is
 * running, waiting for credentials or queued — or undefined. Disable write
 * controls with this as their tooltip; reads are never blocked.
 */
export function useWritesBlocked(repoId: string): string | undefined {
  const api = useApi()
  return writesBlockedBy(useQuery(jobsQuery(api, repoId)).data)
}
