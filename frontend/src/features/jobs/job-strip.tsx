// A strip above the command log showing the background job in progress
// (fetch, pull, push): git's progress, a 取消 button, and the outcome once
// it has finished.
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, CircleCheck, CircleSlash, LoaderCircle, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { OperationErrorNotice } from "@/features/operations/operation-error-view"
import { useApi } from "@/lib/api/context"
import { isFinished, type Job, jobError, jobsQuery } from "@/lib/api/jobs"
import { useCancelJob } from "@/lib/api/use-job"
import { cn } from "@/lib/utils"
import { describeJob, jobToShow } from "./job-status"

/** How long a successful job's outcome stays visible. */
const SUCCESS_VISIBLE_MS = 4000

export function JobStrip({ repoId }: { repoId: string }) {
  const api = useApi()
  const jobs = useQuery(jobsQuery(api, repoId))
  const cancel = useCancelJob(repoId)
  // Jobs that had finished before the page loaded, and those dismissed since.
  const [hidden, setHidden] = useState<ReadonlySet<string>>()
  const hide = (id: string) => setHidden((previous) => new Set(previous).add(id))

  useEffect(() => {
    if (jobs.data && !hidden) {
      setHidden(new Set(jobs.data.filter((job) => isFinished(job.state)).map((job) => job.id)))
    }
  }, [jobs.data, hidden])

  const shown = jobs.data && hidden ? jobToShow(jobs.data, hidden) : undefined
  const succeeded = shown?.job.state === "succeeded" ? shown.job.id : undefined
  useEffect(() => {
    if (!succeeded) return
    const timer = setTimeout(() => setHidden((previous) => new Set(previous).add(succeeded)), SUCCESS_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [succeeded])

  if (!shown) return null
  const { job, waiting } = shown
  const { title, detail, percent, active } = describeJob(job)
  const canceling = cancel.isPending && cancel.variables === job.id
  return (
    <div
      role="status"
      aria-label="后台任务"
      className="flex h-6 shrink-0 items-center gap-2 border-t bg-muted/40 px-3 text-[11px] text-muted-foreground"
    >
      <JobIcon job={job} />
      <span className={cn("shrink-0 font-medium text-foreground", job.state === "failed" && "text-destructive")}>
        {title}
      </span>
      {percent !== undefined && (
        <span
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-muted"
        >
          <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-[10px]" title={detail}>
        {detail}
      </span>
      {waiting > 0 && <span className="shrink-0">另有 {waiting} 个任务等待</span>}
      {job.state === "failed" && <FailureDetails job={job} />}
      {active ? (
        <button
          type="button"
          onClick={() => cancel.mutate(job.id)}
          disabled={canceling}
          className="h-5 shrink-0 rounded-md border bg-background px-2 text-foreground shadow-xs disabled:opacity-50"
        >
          {canceling ? "正在取消…" : "取消"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => hide(job.id)}
          aria-label="关闭"
          className="shrink-0 rounded p-0.5 hover:bg-accent"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

function JobIcon({ job }: { job: Job }) {
  const className = "size-3.5 shrink-0"
  switch (job.state) {
    case "queued":
    case "running":
      return <LoaderCircle className={cn(className, "animate-spin text-primary")} />
    case "succeeded":
      return <CircleCheck className={cn(className, "text-success")} />
    case "failed":
      return <AlertCircle className={cn(className, "text-destructive")} />
    case "canceled":
      return <CircleSlash className={className} />
  }
}

/** git's output for a failed job, on demand. */
function FailureDetails({ job }: { job: Job }) {
  const error = jobError(job)
  // The error arrives with the job list refetched after the final event.
  if (!error) return null
  return (
    <Popover>
      <PopoverTrigger className="h-5 shrink-0 rounded-md border bg-background px-2 text-foreground shadow-xs">
        详情
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[min(36rem,calc(100vw-2rem))] p-2">
        <OperationErrorNotice error={error} />
      </PopoverContent>
    </Popover>
  )
}
