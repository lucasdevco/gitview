import { expect, test } from "vitest"
import type { Job } from "@/lib/api/jobs"
import { describeJob, jobToShow } from "./job-status"

const job = (id: string, state: Job["state"], fields: Partial<Job> = {}): Job => ({
  id,
  repoId: "r1",
  operation: "fetch",
  state,
  commands: [],
  ...fields,
})

test("a job is described by its operation's Sourcetree name and its state", () => {
  expect(describeJob(job("a", "queued"))).toEqual({ title: "等待其他操作完成后抓取", active: true })
  expect(describeJob(job("a", "running"))).toEqual({ title: "正在抓取…", active: true })
  expect(describeJob(job("a", "succeeded"))).toEqual({ title: "抓取完成", active: false })
  expect(describeJob(job("a", "failed"))).toEqual({ title: "抓取失败", active: false })
  expect(describeJob(job("a", "canceled"))).toEqual({ title: "已取消抓取", active: false })
  expect(describeJob(job("a", "running", { operation: "push" })).title).toBe("正在推送…")
})

test("a running job shows git's last progress line and its percentage", () => {
  const progress = { phase: "Receiving objects", percent: 45, text: "Receiving objects:  45% (9/20)" }
  expect(describeJob(job("a", "running", { progress }))).toEqual({
    title: "正在抓取…",
    detail: "Receiving objects:  45% (9/20)",
    percent: 45,
    active: true,
  })
  const line = { phase: "", percent: -1, text: "From ../origin" }
  expect(describeJob(job("a", "running", { progress: line }))).toEqual({
    title: "正在抓取…",
    detail: "From ../origin",
    active: true,
  })
})

test("the running job is shown first, with how many more wait behind it", () => {
  const jobs = [job("old", "failed"), job("run", "running"), job("next", "queued"), job("last", "queued")]
  expect(jobToShow(jobs, new Set(["old"]))).toEqual({ job: jobs[1], waiting: 2 })
})

test("otherwise the newest finished job is shown unless it is hidden", () => {
  const jobs = [job("earlier", "failed"), job("latest", "canceled")]
  expect(jobToShow(jobs, new Set())).toEqual({ job: jobs[1], waiting: 0 })
  expect(jobToShow(jobs, new Set(["latest"]))).toEqual({ job: jobs[0], waiting: 0 })
  expect(jobToShow(jobs, new Set(["earlier", "latest"]))).toBeUndefined()
})
