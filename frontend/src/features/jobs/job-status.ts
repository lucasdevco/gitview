// What the job strip says about background jobs (fetch, pull, push).
import type { Job } from "@/lib/api/jobs"

/** Sourcetree's names for the operations that run as jobs. */
const OPERATION_NAMES: Record<string, string> = { fetch: "抓取", pull: "拉取", push: "推送" }

export type JobDescription = {
  /** One line naming the operation and where it is. */
  title: string
  /** git's last progress line while the job runs. */
  detail?: string
  /** How far git's current phase is, 0 to 100, when git says. */
  percent?: number
  /** Queued or running, so it can still be canceled. */
  active: boolean
}

export function describeJob(job: Job): JobDescription {
  const name = OPERATION_NAMES[job.operation] ?? job.operation
  switch (job.state) {
    case "queued":
      return { title: `等待其他操作完成后${name}`, active: true }
    case "running": {
      const progress = job.progress
      return {
        title: `正在${name}…`,
        ...(progress && { detail: progress.text }),
        ...(progress && progress.percent >= 0 && { percent: progress.percent }),
        active: true,
      }
    }
    case "succeeded":
      return { title: `${name}完成`, active: false }
    case "failed":
      return { title: `${name}失败`, active: false }
    case "canceled":
      return { title: `已取消${name}`, active: false }
  }
}

/**
 * The job the strip shows: the running one, or the oldest queued (jobs run
 * one at a time, so the others wait behind it); else the newest finished job
 * not in `hidden` — the ones the user dismissed and those that had finished
 * before the page loaded, which are not news.
 */
export function jobToShow(
  jobs: readonly Job[],
  hidden: ReadonlySet<string>,
): { job: Job; waiting: number } | undefined {
  const active = jobs.filter((job) => describeJob(job).active)
  const first = active.find((job) => job.state === "running") ?? active.at(0)
  if (first) return { job: first, waiting: active.length - 1 }
  const finished = jobs.filter((job) => !hidden.has(job.id)).at(-1)
  return finished && { job: finished, waiting: 0 }
}
