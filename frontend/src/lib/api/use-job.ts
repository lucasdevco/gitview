import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useApi } from "./context"
import { cancelJob, type Job, type JobName, type JobRequests, jobKeys, startJob } from "./jobs"

/**
 * A mutation starting a background job. It settles as soon as the job is
 * queued; follow the job in the jobs query (jobsQuery), which job events
 * keep current. A request the server rejects outright throws ApiError.
 */
export function useStartJob<Op extends JobName>(repoId: string, op: Op) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: JobRequests[Op]) => startJob(api, repoId, op, request),
    onSuccess: (job) =>
      // The job's first events may arrive before this response; they are newer.
      queryClient.setQueryData<Job[]>(jobKeys.list(repoId), (jobs = []) =>
        jobs.some((listed) => listed.id === job.id) ? jobs : [...jobs, job],
      ),
  })
}

/** A mutation canceling a job by ID; the job reports "canceled" once it has stopped. */
export function useCancelJob(repoId: string) {
  const api = useApi()
  return useMutation({ mutationFn: (jobId: string) => cancelJob(api, repoId, jobId) })
}
