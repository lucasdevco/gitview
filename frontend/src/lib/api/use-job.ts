import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useApi } from "./context"
import {
  answerPrompt,
  applyPromptAnswered,
  cancelJob,
  type Job,
  type JobName,
  type JobRequests,
  jobKeys,
  jobRun,
  jobsQuery,
  startJob,
} from "./jobs"

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

export type PromptAnswer = { jobId: string; promptId: string; answer: string | null }

/**
 * A mutation answering (or, with `answer: null`, declining) a job's
 * credential prompt. The answer goes to the server only; nothing keeps it.
 */
export function useAnswerPrompt(repoId: string) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, promptId, answer }: PromptAnswer) => answerPrompt(api, repoId, jobId, promptId, answer),
    // The response's job is older than a next prompt that arrived as an event.
    onSuccess: (_job, { jobId, promptId }) =>
      queryClient.setQueryData<Job[]>(jobKeys.list(repoId), (jobs) => applyPromptAnswered(jobs, jobId, promptId)),
  })
}

/** A mutation canceling a job by ID; the job reports "canceled" once it has stopped. */
export function useCancelJob(repoId: string) {
  const api = useApi()
  return useMutation({ mutationFn: (jobId: string) => cancelJob(api, repoId, jobId) })
}

/**
 * Starts a job from a dialog and follows it to the end, so the dialog can
 * stay open with a spinner and git's progress until the job has finished.
 * `onSucceeded` runs once when it succeeds (close the dialog then); a failed
 * job leaves its error in `error`. A job waiting for credentials is answered
 * in CredentialDialog; `waitingForCredentials` tells the dialog to step aside.
 */
export function useJobRun<Op extends JobName>(repoId: string, op: Op, { onSucceeded }: { onSucceeded: () => void }) {
  const api = useApi()
  const start = useStartJob(repoId, op)
  const jobs = useQuery(jobsQuery(api, repoId))
  const [jobId, setJobId] = useState<string>()
  const run = jobId ? jobRun(jobs.data, jobId) : undefined
  const succeeded = useRef(onSucceeded)
  succeeded.current = onSucceeded
  useEffect(() => {
    if (run?.state === "succeeded") succeeded.current()
  }, [run?.state])
  const running = run?.state === "running" ? run : undefined
  return {
    run: (request: JobRequests[Op]) => {
      setJobId(undefined)
      start.mutate(request, { onSuccess: (job) => setJobId(job.id) })
    },
    pending: start.isPending || !!running,
    progress: running?.progress,
    waitingForCredentials: !!running?.waitingForCredentials,
    canceled: run?.state === "canceled",
    error: (start.error ?? (run?.state === "failed" ? run.error : undefined)) || undefined,
    reset: () => {
      start.reset()
      setJobId(undefined)
    },
  }
}
