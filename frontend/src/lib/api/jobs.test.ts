import { expect, test } from "vitest"
import { ApiError } from "./client"
import { applyJobUpdate, applyPromptAnswered, type Job, type JobUpdate, jobError, jobRun, pendingPrompt } from "./jobs"

const queued: Job = { id: "j1", repoId: "r1", operation: "fetch", state: "queued", commands: [] }
const update = (fields: Partial<JobUpdate>): JobUpdate => ({
  type: "job.updated",
  repoId: "r1",
  jobId: "j1",
  operation: "fetch",
  state: "running",
  ...fields,
})

test("an update moves a listed job's state and progress", () => {
  const counting = { phase: "remote: Counting objects", percent: 45, text: "remote: Counting objects:  45% (9/20)" }
  const other: Job = { ...queued, id: "j0", state: "succeeded" }
  expect(applyJobUpdate([other, queued], update({ progress: counting }))).toEqual([
    other,
    { ...queued, state: "running", progress: counting },
  ])
})

test("an update without progress keeps the last progress line", () => {
  const progress = { phase: "Receiving objects", percent: 100, text: "Receiving objects: 100% (3/3), done." }
  const running: Job = { ...queued, state: "running", progress }
  expect(applyJobUpdate([running], update({ state: "succeeded" }))).toEqual([{ ...running, state: "succeeded" }])
})

test("a job started elsewhere is added when its first update arrives", () => {
  expect(applyJobUpdate(undefined, update({ jobId: "j9", state: "queued" }))).toEqual([
    { id: "j9", repoId: "r1", operation: "fetch", state: "queued", progress: undefined, commands: [] },
  ])
})

test("an update carries the job's credential prompt and clears it once answered", () => {
  const prompt = { id: "p1", text: "Password for 'https://example.com':", secret: true }
  const asking = applyJobUpdate([queued], update({ prompt }))
  expect(asking).toEqual([{ ...queued, state: "running", prompt }])
  expect(applyJobUpdate(asking, update({}))).toEqual([{ ...queued, state: "running", prompt: undefined }])
})

test("answering a prompt closes it but keeps the next prompt that already arrived", () => {
  const username = { id: "p1", text: "Username for 'https://example.com':", secret: false }
  const password = { id: "p2", text: "Password for 'https://ada@example.com':", secret: true }
  const asking: Job = { ...queued, state: "running", prompt: username }
  expect(applyPromptAnswered([asking], "j1", "p1")).toEqual([{ ...asking, prompt: undefined }])
  // The password prompt's event can arrive before the answer's response.
  const askingAgain: Job = { ...asking, prompt: password }
  expect(applyPromptAnswered([askingAgain], "j1", "p1")).toEqual([askingAgain])
})

test("the prompt waiting for an answer is the first asking job's", () => {
  const prompt = { id: "p1", text: "Username for 'https://example.com':", secret: false }
  const asking: Job = { ...queued, id: "j2", state: "running", prompt }
  expect(pendingPrompt([queued, asking])).toEqual({ job: asking, prompt })
  expect(pendingPrompt([queued])).toBeUndefined()
  expect(pendingPrompt(undefined)).toBeUndefined()
})

test("a failed job's error reads like a failed operation's", () => {
  const command = { command: "git fetch --progress nowhere", startedAt: "", durationMs: 3, exitCode: 128 }
  const failed: Job = {
    ...queued,
    state: "failed",
    commands: [command],
    error: {
      code: "git_failed",
      message: "git fetch failed",
      output: "fatal: 'nowhere' does not appear to be a git repository",
    },
  }
  const error = jobError(failed)
  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ code: "git_failed", message: "git fetch failed", commands: [command] })
  expect(error?.output).toContain("'nowhere'")
  expect(jobError({ ...queued, state: "canceled" })).toBeUndefined()
})

test("a job started from a dialog runs until the list shows it finished", () => {
  const progress = { phase: "Receiving objects", percent: 40, text: "Receiving objects:  40% (4/10)" }
  // Started, but neither its response nor its first event has listed it yet.
  expect(jobRun(undefined, "j1")).toEqual({ state: "running", waitingForCredentials: false })
  expect(jobRun([queued], "j1")).toEqual({ state: "running", waitingForCredentials: false })
  expect(jobRun([{ ...queued, state: "running", progress }], "j1")).toEqual({
    state: "running",
    progress,
    waitingForCredentials: false,
  })
  const prompt = { id: "p1", text: "Username for 'https://example.com':", secret: false }
  expect(jobRun([{ ...queued, state: "running", prompt }], "j1")).toEqual({
    state: "running",
    waitingForCredentials: true,
  })
  expect(jobRun([{ ...queued, state: "succeeded" }], "j1")).toEqual({ state: "succeeded" })
  expect(jobRun([{ ...queued, state: "canceled" }], "j1")).toEqual({ state: "canceled" })
})

test("a failed job's run carries its error once the refetched list has it", () => {
  expect(jobRun([{ ...queued, state: "failed" }], "j1")).toEqual({ state: "failed", error: undefined })
  const failed: Job = {
    ...queued,
    state: "failed",
    error: { code: "push_rejected", message: "rejected", hint: "pull first" },
  }
  const run = jobRun([failed], "j1")
  expect(run?.state).toBe("failed")
  expect(run?.state === "failed" && run.error).toBeInstanceOf(ApiError)
})
