// What a job started from a dialog is doing, shown in the dialog while it
// stays open: git's latest progress line, or that it waits for credentials.
import { LoaderCircle } from "lucide-react"
import type { JobProgress } from "@/lib/api/jobs"

export function JobRunStatus({
  pending,
  progress,
  waitingForCredentials,
  canceled,
}: {
  pending: boolean
  progress?: JobProgress
  waitingForCredentials: boolean
  canceled: boolean
}) {
  if (canceled) {
    return (
      <p role="status" className="rounded-md bg-muted px-2.5 py-1.5 text-muted-foreground">
        任务已取消。
      </p>
    )
  }
  if (!pending) return null
  const text = waitingForCredentials ? "正在等待输入凭据…" : progress?.text || "正在执行…"
  return (
    <div role="status" aria-live="polite" className="space-y-1 rounded-md bg-muted px-2.5 py-1.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-3 shrink-0 animate-spin" />
        <span className="min-w-0 truncate font-mono text-[11px]" title={text}>
          {text}
        </span>
      </div>
      {!waitingForCredentials && progress && progress.percent >= 0 && (
        <div className="h-1 overflow-hidden rounded-full bg-background">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${progress.percent}%` }} />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">关闭对话框后任务会在后台继续，可在底部任务栏查看或取消。</p>
    </div>
  )
}
