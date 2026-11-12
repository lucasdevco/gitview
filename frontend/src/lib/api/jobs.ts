// Background jobs: long-running writes that talk to remotes (fetch, pull,
// push, fetchInto). Starting one (POST .../operations/{op}) answers at once with
// the queued job; "job.updated" events on the event stream carry its state
// and git's progress, and the jobs query (GET .../jobs) holds each job's
// commands and error once it has finished.
//
// A job whose remote needs credentials waits with a `prompt` (carried by
// its job.updated events too) until answerPrompt answers or declines it.
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

/** A question git asks while a job runs, such as a user name or password. */
export type CredentialPrompt = {
  id: string
  /** git's or ssh's prompt, e.g. `Password for 'https://host':`. */
  text: string
  /** The answer should be typed hidden: a password or passphrase. */
  secret: boolean
}

export type Job = {
  id: string
  repoId: string
  /** The operation the job runs, e.g. "fetch". */
  operation: string
  state: JobState
  progress?: JobProgress
  /** The credential prompt waiting for an answer, if any. */
  prompt?: CredentialPrompt
  /** The git commands the job ran, once it has finished. */
  commands: CommandEntry[]
  /** Why the job failed; only when `state` is "failed". */
  error?: { code: string; message: string; hint?: string; output?: string }
}

/** A "job.updated" event: a job changed state or git printed progress. */
export type JobUpdate = {
  type: "job.updated"
  repoId: string
  jobId: string
  operation: string
  state: JobState
  progress?: JobProgress
  /** The credential prompt waiting for an answer; absent once it is answered or closed. */
  prompt?: CredentialPrompt
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

export type PullRequest = {
  /** The remote to pull from; without it (and `branch`), the current branch's upstream. */
  remote?: string
  /** The branch on the remote, e.g. "main" (not "origin/main"); needs `remote`. */
  branch?: string
  /** Replay local commits on top instead of merging (`--rebase`); not with the merge options. */
  rebase?: boolean
  /** Stop before the merge commit (`--no-commit`). */
  noCommit?: boolean
  /** List the merged commits in the merge commit's message (`--log`). */
  log?: boolean
  /** Create a merge commit even when a fast-forward is possible (`--no-ff`). */
  noFastForward?: boolean
}

/** One local branch to push. */
export type PushBranch = {
  local: string
  /** The branch on the remote; defaults to the local name. */
  remote?: string
  /** Track the pushed remote branch afterwards (`-u`). */
  track?: boolean
}

export type PushRequest = {
  remote: string
  branches: PushBranch[]
  /** Push every tag too (`--tags`). */
  tags?: boolean
}

/** 拿来: fast-forward a local branch that is not checked out to a remote branch. */
export type FetchIntoRequest = {
  remote: string
  /** The branch on the remote, e.g. "main". */
  branch: string
  local: string
}

/** Request body of each job, by operation name. */
export type JobRequests = {
  fetch: FetchRequest
  pull: PullRequest
  push: PushRequest
  fetchInto: FetchIntoRequest
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

/** Answers a job's credential prompt; `null` declines it, which fails the job's git command. */
export function answerPrompt(
  client: ApiClient,
  repoId: string,
  jobId: string,
  promptId: string,
  answer: string | null,
): Promise<Job> {
  return client.post(repoPath(repoId, "jobs", jobId, "prompt"), { promptId, answer })
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
 * The job list after an update: the job's state, progress and prompt
 * change; a job not listed yet (started in another tab) is added. Commands
 * and error are not in updates; refetch the list once a job has finished.
 */
export function applyJobUpdate(jobs: readonly Job[] | undefined, update: JobUpdate): Job[] {
  const list = jobs ?? []
  const { jobId: id, repoId, operation, state, progress, prompt } = update
  if (!list.some((job) => job.id === id)) {
    return [...list, { id, repoId, operation, state, progress, ...(prompt && { prompt }), commands: [] }]
  }
  return list.map((job) => (job.id === id ? { ...job, state, progress: progress ?? job.progress, prompt } : job))
}

/**
 * Closes the prompt the user just answered. A prompt that replaced it (the
 * password after the user name, delivered as an event before the answer's
 * response) stays open.
 */
export function applyPromptAnswered(jobs: readonly Job[] | undefined, jobId: string, promptId: string): Job[] {
  return (jobs ?? []).map((job) =>
    job.id === jobId && job.prompt?.id === promptId ? { ...job, prompt: undefined } : job,
  )
}

/** The credential prompt to show: the first job waiting for an answer. */
export function pendingPrompt(jobs: readonly Job[] | undefined): { job: Job; prompt: CredentialPrompt } | undefined {
  const job = jobs?.find((listed) => listed.prompt)
  return job?.prompt && { job, prompt: job.prompt }
}

/** A failed job's error as an ApiError, the way a failed operation throws it. */
export function jobError(job: Job): ApiError | undefined {
  if (job.state !== "failed" || !job.error) return undefined
  const { code, message, hint, output } = job.error
  return new ApiError(500, code, message, { output, hint, commands: job.commands })
}
