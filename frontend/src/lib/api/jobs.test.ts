import { expect, test } from "vitest"
import { ApiError } from "./client"
import { applyJobUpdate, type Job, type JobUpdate, jobError } from "./jobs"

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
