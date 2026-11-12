import { ChevronDown, ChevronUp, Ellipsis, Search } from "lucide-react"
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react"
import type { FileChange, FileDiff } from "@/lib/api/worktree"
import { cn } from "@/lib/utils"
import { describeChange } from "./file-path"
import { FileStatusIcon } from "./file-status-icon"
import { type DiffHunk, type DiffLine, parseDiff } from "./parse-diff"
import { type DiffMatch, findDiffMatches } from "./search"

/** A button in a hunk header, e.g. "暂存区块". It acts on the hunk it is shown for. */
export type HunkAction = {
  label: string
  onClick: (hunk: DiffHunk) => void
  tone?: "danger"
  /** Shown but not clickable, e.g. while another change is being written. */
  disabled?: boolean
}

export type DiffPanelProps = {
  /** The file being shown; nothing selected shows a hint. */
  file?: FileChange
  diff?: FileDiff
  loading?: boolean
  error?: Error | null
  /** Buttons for each hunk header; none by default. */
  hunkActions?: HunkAction[]
  /** Shown when no file is selected. */
  placeholder?: string
}

/**
 * One file's diff with a search bar: a header naming the file, then each hunk
 * ("块 N： 行 a-b") with old/new line numbers. Binary and oversized diffs
 * show a notice instead of content.
 */
export function DiffPanel({
  file,
  diff,
  loading,
  error,
  hunkActions = [],
  placeholder = "选择一个文件查看差异",
}: DiffPanelProps) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const hunks = useMemo(() => (diff ? parseDiff(diff.patch) : []), [diff])
  const matches = useMemo(() => findDiffMatches(hunks, query), [hunks, query])
  const current = matches.length ? Math.min(active, matches.length - 1) : -1

  const step = (delta: number) => {
    if (matches.length) setActive((current + delta + matches.length) % matches.length)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1 border-b bg-muted/40 px-3 text-[11px]">
        {query && (
          <span className="ml-auto text-muted-foreground tabular-nums" aria-live="polite">
            {matches.length ? `${current + 1}/${matches.length}` : "无匹配"}
          </span>
        )}
        <span className={cn("flex items-center gap-1 rounded border bg-background px-1.5", !query && "ml-auto")}>
          <Search className="size-3 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                step(event.shiftKey ? -1 : 1)
              } else if (event.key === "Escape") setQuery("")
            }}
            placeholder="搜索"
            aria-label="在差异中搜索"
            title="回车：下一个；Shift+回车：上一个；Esc：清除"
            className="h-5 w-32 bg-transparent outline-none"
          />
        </span>
        <IconButton label="上一个匹配" disabled={!matches.length} onClick={() => step(-1)}>
          <ChevronUp className="size-3.5" />
        </IconButton>
        <IconButton label="下一个匹配" disabled={!matches.length} onClick={() => step(1)}>
          <ChevronDown className="size-3.5" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1">
        {file ? (
          <DiffBody
            file={file}
            diff={diff}
            hunks={hunks}
            loading={loading}
            error={error}
            hunkActions={hunkActions}
            matches={matches}
            current={current}
          />
        ) : (
          <Notice>{placeholder}</Notice>
        )}
      </div>
    </div>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function Notice({ children, tone }: { children: ReactNode; tone?: "error" }) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex h-full items-center justify-center p-6 text-center",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {children}
    </div>
  )
}

function DiffBody({
  file,
  diff,
  hunks,
  loading,
  error,
  hunkActions,
  matches,
  current,
}: {
  file: FileChange
  diff?: FileDiff
  hunks: DiffHunk[]
  loading?: boolean
  error?: Error | null
  hunkActions: HunkAction[]
  matches: DiffMatch[]
  current: number
}) {
  const activeRef = useRef<HTMLElement | null>(null)
  const active = matches[current]
  useEffect(() => {
    if (active) activeRef.current?.scrollIntoView({ block: "center" })
  }, [active])

  let body: ReactNode
  if (error) body = <Notice tone="error">无法加载差异：{error.message}</Notice>
  else if (!diff) body = <Notice>{loading ? "正在加载差异…" : ""}</Notice>
  else if (diff.binary) body = <Notice>二进制文件，不显示差异内容。</Notice>
  else if (diff.tooLarge) body = <Notice>差异过大，为保持界面流畅未显示内容。请在终端或编辑器中查看。</Notice>
  else if (!hunks.length) {
    body = (
      <Notice>{file.oldPath ? "文件已重命名，内容没有变化。" : "没有文本差异（可能只改变了文件权限或类型）。"}</Notice>
    )
  } else {
    const lineMatches = new Map<string, DiffMatch[]>()
    for (const match of matches) {
      const key = `${match.hunk}:${match.line}`
      lineMatches.set(key, [...(lineMatches.get(key) ?? []), match])
    }
    body = (
      <div className="h-full overflow-auto font-mono text-[12px] leading-[18px]">
        {hunks.map((hunk, hunkIndex) => (
          <div key={hunk.index}>
            <div className="sticky top-0 z-[1] flex h-7 items-center gap-3 border-b bg-muted/70 pr-2 pl-[7.25rem] font-sans text-muted-foreground">
              <span title={hunk.header}>
                块 {hunk.index}： 行 {hunk.from}-{hunk.to}
              </span>
              <span className="ml-auto flex gap-1">
                {hunkActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    disabled={action.disabled}
                    onClick={() => action.onClick(hunk)}
                    className={cn(
                      "rounded border bg-background px-2 py-px text-[11px] text-foreground hover:bg-muted disabled:opacity-50 disabled:hover:bg-background",
                      action.tone === "danger" && "text-destructive",
                    )}
                  >
                    {action.label}
                  </button>
                ))}
              </span>
            </div>
            {hunk.lines.map((line, lineIndex) => (
              <LineRow
                // Lines never reorder within a parsed hunk, so position is a stable key.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above
                key={lineIndex}
                line={line}
                matches={lineMatches.get(`${hunkIndex}:${lineIndex}`)}
                active={active}
                activeRef={activeRef}
              />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b bg-muted/50 px-3">
        <FileStatusIcon status={file.status} />
        <span className="truncate font-medium text-muted-foreground" title={describeChange(file)}>
          {describeChange(file)}
        </span>
        <button
          type="button"
          aria-label="文件操作"
          disabled
          className="ml-auto rounded px-1 text-muted-foreground disabled:opacity-50"
        >
          <Ellipsis className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  )
}

function LineRow({
  line,
  matches,
  active,
  activeRef,
}: {
  line: DiffLine
  matches?: DiffMatch[]
  active?: DiffMatch
  activeRef: RefObject<HTMLElement | null>
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[3rem_3rem_1.25rem_1fr] whitespace-pre",
        line.kind === "add" && "bg-success/12 text-success",
        line.kind === "del" && "bg-destructive/10 text-destructive",
      )}
    >
      <span className="pr-2 text-right text-muted-foreground/70 select-none">{line.oldNo ?? ""}</span>
      <span className="pr-2 text-right text-muted-foreground/70 select-none">{line.newNo ?? ""}</span>
      <span className="text-center opacity-70 select-none">
        {line.kind === "add" ? "+" : line.kind === "del" ? "-" : ""}
      </span>
      <span className="pr-4 text-foreground">
        <Highlighted text={line.text} matches={matches} active={active} activeRef={activeRef} />
        {line.noNewline && (
          <span className="ml-2 font-sans text-[10px] text-muted-foreground select-none" title="文件末尾没有换行符">
            ⏎ 无换行符
          </span>
        )}
      </span>
    </div>
  )
}

function Highlighted({
  text,
  matches,
  active,
  activeRef,
}: {
  text: string
  matches?: DiffMatch[]
  active?: DiffMatch
  activeRef: RefObject<HTMLElement | null>
}) {
  if (!matches?.length) return text
  const parts: ReactNode[] = []
  let at = 0
  for (const match of matches) {
    if (match.start > at) parts.push(text.slice(at, match.start))
    const isActive = match === active
    parts.push(
      <mark
        key={match.start}
        ref={isActive ? activeRef : undefined}
        className={cn("rounded-[2px] text-foreground", isActive ? "bg-warning" : "bg-warning/35")}
      >
        {text.slice(match.start, match.end)}
      </mark>,
    )
    at = match.end
  }
  parts.push(text.slice(at))
  return parts
}
