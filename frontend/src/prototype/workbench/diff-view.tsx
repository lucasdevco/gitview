// PROTOTYPE — unified diff renderer with hunk actions, styled after Sourcetree's diff pane.
import { Ellipsis, Minus, MoveRight, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChangedFile, FileStatus } from "./data"

type DiffLine = { id: string; kind: "context" | "add" | "del"; text: string; oldNo?: number; newNo?: number }
type Hunk = { id: string; index: number; from: number; to: number; lines: DiffLine[] }

function parseDiff(diff: string): Hunk[] {
  const hunks: Hunk[] = []
  let oldNo = 0
  let newNo = 0
  let current: Hunk | undefined
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("---") || raw.startsWith("+++")) continue
    if (raw.startsWith("@@")) {
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(raw)
      oldNo = Number(match?.[1] ?? 0)
      newNo = Number(match?.[2] ?? 0)
      const count = Number(match?.[3] ?? 1)
      current = {
        id: `h${hunks.length}`,
        index: hunks.length + 1,
        from: newNo,
        to: newNo + Math.max(count - 1, 0),
        lines: [],
      }
      hunks.push(current)
      continue
    }
    if (!current) continue
    const id = `${current.id}-${current.lines.length}`
    const text = raw.slice(1)
    if (raw.startsWith("+")) current.lines.push({ id, kind: "add", text, newNo: newNo++ })
    else if (raw.startsWith("-")) current.lines.push({ id, kind: "del", text, oldNo: oldNo++ })
    else current.lines.push({ id, kind: "context", text, oldNo: oldNo++, newNo: newNo++ })
  }
  return hunks
}

export type HunkAction = { label: string; onClick: () => void; tone?: "danger" }

export function DiffView({ file, hunkActions = [] }: { file?: ChangedFile; hunkActions?: HunkAction[] }) {
  if (!file) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">选择一个文件查看差异</div>
  }
  const hunks = parseDiff(file.diff)
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b bg-muted/50 px-3">
        <StatusIcon status={file.status} />
        <span className="truncate font-medium text-muted-foreground">{file.path}</span>
        <button type="button" aria-label="文件操作" className="ml-auto rounded px-1 hover:bg-accent">
          <Ellipsis className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-[18px]">
        {hunks.map((hunk) => (
          <div key={hunk.id}>
            <div className="sticky top-0 z-[1] flex h-7 items-center gap-3 border-b bg-muted/70 pr-2 pl-[6.5rem] font-sans text-muted-foreground">
              <span>
                块 {hunk.index}： 行 {hunk.from}-{hunk.to}
              </span>
              <span className="ml-auto flex gap-1">
                {hunkActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={action.onClick}
                    className={cn(
                      "rounded border bg-background px-2 py-px text-[11px] text-foreground hover:bg-muted",
                      action.tone === "danger" && "text-destructive",
                    )}
                  >
                    {action.label}
                  </button>
                ))}
              </span>
            </div>
            {hunk.lines.map((line) => (
              <div
                key={line.id}
                className={cn(
                  "grid grid-cols-[2.5rem_2.5rem_1.25rem_1fr] whitespace-pre",
                  line.kind === "add" && "bg-success/12 text-success",
                  line.kind === "del" && "bg-destructive/10 text-destructive",
                )}
              >
                <span className="select-none pr-2 text-right text-muted-foreground/70">{line.oldNo ?? ""}</span>
                <span className="select-none pr-2 text-right text-muted-foreground/70">{line.newNo ?? ""}</span>
                <span className="select-none text-center opacity-70">
                  {line.kind === "add" ? "+" : line.kind === "del" ? "-" : ""}
                </span>
                <span className="pr-4 text-foreground">{line.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

const statusStyle: Record<FileStatus, { className: string; label: string }> = {
  added: { className: "bg-success", label: "新增" },
  modified: { className: "bg-warning", label: "修改" },
  deleted: { className: "bg-destructive", label: "删除" },
  renamed: { className: "bg-chart-4", label: "重命名" },
  untracked: { className: "bg-primary", label: "未跟踪" },
}

export function StatusIcon({ status }: { status: FileStatus }) {
  const style = statusStyle[status]
  const Icon = status === "added" ? Plus : status === "deleted" ? Minus : status === "renamed" ? MoveRight : Ellipsis
  return (
    <span
      title={style.label}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] text-white",
        style.className,
      )}
    >
      {status === "untracked" ? (
        <span className="text-[10px] font-bold leading-none">?</span>
      ) : (
        <Icon className="size-3" strokeWidth={3} />
      )}
    </span>
  )
}
