import { useQuery } from "@tanstack/react-query"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useApi } from "@/lib/api/context"
import { type CommandEntry, commandLogQuery } from "@/lib/api/operations"
import { cn } from "@/lib/utils"

const failed = (entry: CommandEntry) => entry.exitCode !== 0

/**
 * The bottom bar: the last git command gitview ran for this repository.
 * Clicking it lists the recent commands, newest first.
 */
export function CommandLogBar({ repoId }: { repoId?: string }) {
  const api = useApi()
  const log = useQuery({ ...commandLogQuery(api, repoId ?? ""), enabled: !!repoId })
  const entries = log.data ?? []
  const last = entries.at(-1)

  const bar = (
    <span className={cn("min-w-0 flex-1 truncate text-left font-mono", last && failed(last) && "text-destructive")}>
      {last ? `$ ${last.command}${failed(last) ? `（失败，退出码 ${last.exitCode}）` : ""}` : "命令日志：暂无"}
    </span>
  )
  return (
    <footer className="flex h-5 shrink-0 items-center border-t bg-muted/40 text-[10px] text-muted-foreground">
      {entries.length ? (
        <Popover>
          <PopoverTrigger
            className="flex h-full min-w-0 flex-1 items-center px-3 hover:bg-accent/60"
            title="查看最近执行的命令"
          >
            {bar}
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-[min(48rem,calc(100vw-2rem))] p-0">
            <div className="border-b px-3 py-1.5 text-[11px] font-medium">命令日志（最近 {entries.length} 条）</div>
            <ol className="max-h-80 overflow-y-auto py-1 font-mono text-[11px]" aria-label="命令日志">
              {[...entries].reverse().map((entry) => (
                <li
                  // Start times have nanosecond precision and writes never overlap.
                  key={`${entry.startedAt} ${entry.command}`}
                  className={cn("flex gap-3 px-3 py-0.5", failed(entry) && "text-destructive")}
                >
                  <time dateTime={entry.startedAt} className="shrink-0 text-muted-foreground">
                    {new Date(entry.startedAt).toLocaleTimeString("zh-CN", { hour12: false })}
                  </time>
                  <span className="min-w-0 flex-1 break-all whitespace-pre-wrap">{entry.command}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {failed(entry) ? `退出码 ${entry.exitCode}` : `${entry.durationMs} ms`}
                  </span>
                </li>
              ))}
            </ol>
          </PopoverContent>
        </Popover>
      ) : (
        <span className="flex min-w-0 flex-1 px-3">{bar}</span>
      )}
    </footer>
  )
}
