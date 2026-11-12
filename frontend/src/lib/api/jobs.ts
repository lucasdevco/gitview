// Background jobs: long-running writes that talk to remotes (fetch; pull and
// push later). Starting one (POST .../operations/{op}) answers at once with
// the queued job; "job.updated" events on the event stream carry its state
// and git's progress, and the jobs query (GET .../jobs) holds each job's
// commands and error once it has finished.
//
// Adding a job: register it with newJob in internal/server/operations.go,
// add its request type to JobRequests, a preview builder in
// lib/command-preview.ts, and start it with useStartJob(repoId, "<op>").
import { queryOptions } from "@tanstack/react-query"
import { type ApiClient, ApiError } from "./client"
import type { CommandEntry } from "./operations"
import { repoPath } from "./repos"

export type JobState = "queued" | "running" | "succeeded" | "failed" | "canceled"

/** One status line git printed, e.g. `Receiving objects:  45% (9/20)`. */
export type JobProgress = {
  /** The counter's name, e.g. "Receiving objects"; empty for other lines. */
  phase: string
  /** 0 to 100; -1 when the line has no percentage. */
  percent: number
  text: string
}

export type Job = {
  id: string
  repoId: string
  /** The operation the job runs, e.g. "fetch". */
  operation: string
  state: JobState
  progress?: JobProgress
  /** The git commands the job ran, once it has finished. */
  commands: CommandEntry[]
  /** Why the job failed; only when `state` is "failed". */
  error?: { code: string; message: string; output?: string }
}

/** A "job.updated" event: a job changed state or git printed progress. */
export type JobUpdate = {
  type: "job.updated"
  repoId: string
  jobId: string
  operation: string
  state: JobState
  progress?: JobProgress
}

export type FetchRequest = {
  /** Fetch from every remote (`--all`). */
  all?: boolean
  /** The one remote to fetch from; not with `all`. Without either, git's default remote. */
  remote?: string
  /** Delete remote-tracking branches whose branch is gone from the remote (`--prune`). */
  prune?: boolean
  /** Fetch every tag, not only those on fetched commits (`--tags`). */
  tags?: boolean
}

/** Request body of each job, by operation name. */
export type JobRequests = {
  fetch: FetchRequest
}

export type JobName = keyof JobRequests

export function isFinished(state: JobState): boolean {
  return state === "succeeded" || state === "failed" || state === "canceled"
}

/** Starts a job and returns it, queued. */
export function startJob<Op extends JobName>(
  client: ApiClient,
  repoId: string,
  op: Op,
  request: JobRequests[Op],
  signal?: AbortSignal,
): Promise<Job> {
  return client.post(repoPath(repoId, "operations", op), request, signal)
}

/** Running and recently finished jobs, oldest first. */
export function listJobs(client: ApiClient, repoId: string, signal?: AbortSignal): Promise<Job[]> {
  return client.get(repoPath(repoId, "jobs"), signal)
}

/** Stops a queued or running job; it reports "canceled" once it has stopped. */
export function cancelJob(client: ApiClient, repoId: string, jobId: string): Promise<Job> {
  return client.post(repoPath(repoId, "jobs", jobId, "cancel"), {})
}

export const jobKeys = {
  list: (repoId: string) => ["repos", repoId, "jobs"] as const,
}

export function jobsQuery(client: ApiClient, repoId: string) {
  return queryOptions({
    queryKey: jobKeys.list(repoId),
    queryFn: ({ signal }) => listJobs(client, repoId, signal),
  })
}

/**
 * The job list after an update: the job's state and progress change; a job
 * not listed yet (started in another tab) is added. Commands and error are
 * not in updates; refetch the list once a job has finished.
 */
export function applyJobUpdate(jobs: readonly Job[] | undefined, update: JobUpdate): Job[] {
  const list = jobs ?? []
  const { jobId: id, repoId, operation, state, progress } = update
  if (!list.some((job) => job.id === id)) return [...list, { id, repoId, operation, state, progress, commands: [] }]
  return list.map((job) => (job.id === id ? { ...job, state, progress: progress ?? job.progress } : job))
}

/** A failed job's error as an ApiError, the way a failed operation throws it. */
export function jobError(job: Job): ApiError | undefined {
  if (job.state !== "failed" || !job.error) return undefined
  const { code, message, output } = job.error
  return new ApiError(500, code, message, { output, commands: job.commands })
}
