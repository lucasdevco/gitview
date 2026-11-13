import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import {
  type KeyboardEvent,
  type UIEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { CommitDetails, UncommittedChanges } from "@/features/commit-details/commit-details"
import { useApi } from "@/lib/api/context"
import { commitSearchQuery, type GraphCommit, type GraphOptions, graphQuery, type Refs } from "@/lib/api/history"
import type { RepoSummary } from "@/lib/api/repos"
import { type WorktreeStatus, worktreeStatusQuery } from "@/lib/api/worktree"
import { formatRelativeDate } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { CommitContextMenu } from "./commit-context-menu"
import type { CommitActions } from "./commit-operations"
import { type GraphRow, laneColor, layoutGraph } from "./graph"
import { GraphCell, graphColumnWidth, ROW_HEIGHT } from "./graph-cell"
import { reachableFrom } from "./reachable"
import { RefLabel, refsByCommit } from "./ref-label"
import { searchCommits } from "./search"
import { UNCOMMITTED, withUncommittedChanges } from "./uncommitted"
import { scrollTopToReveal, visibleRange } from "./virtual-window"

/**
 * The commit to select and scroll into view. `seq` changes on every request,
 * so revealing the same commit again scrolls to it again.
 */
export type Selection = { oid: string; seq: number }

/** A list row: a commit, or the virtual "未提交的更改" row (no `commit`, oid {@link UNCOMMITTED}). */
type HistoryRow = { oid: string; commit?: GraphCommit; graph: GraphRow }

const hasChanges = (status?: WorktreeStatus) =>
  !!status && status.staged.length + status.unstaged.length + status.untracked.length + status.conflicted.length > 0

const SEARCH_ROW: GraphRow = { lane: 0, color: 0, segments: [], width: 1 }
const filterSelect = "h-5 rounded bg-transparent pr-1 hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent"

/** `value`, once it has stayed the same for `delay` milliseconds. */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

function useVirtualWindow(count: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => setViewport(element.clientHeight))
    observer.observe(element)
    setViewport(element.clientHeight)
    return () => observer.disconnect()
  }, [])
  const scrollToIndex = useCallback((index: number) => {
    const element = ref.current
    if (!element) return
    element.scrollTop = scrollTopToReveal({
      index,
      scrollTop: element.scrollTop,
      viewport: element.clientHeight,
      rowHeight: ROW_HEIGHT,
    })
  }, [])
  return {
    ref,
    range: visibleRange({ scrollTop, viewport, rowHeight: ROW_HEIGHT, count, overscan: 10 }),
    onScroll: (event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop),
    scrollToIndex,
  }
}

/**
 * The history view: filter bar, then the commit list with its lane graph.
 * In search mode the scope selector becomes a search box that filters by
 * message, author or hash prefix.
 */
export function HistoryView({
  summary,
  refs,
  selection,
  onSelect,
  searchMode,
  commitActions,
}: {
  summary: RepoSummary
  refs?: Refs
  selection?: Selection
  onSelect: (oid: string) => void
  searchMode: boolean
  /** What a commit's context menu does; undefined while the repository loads. */
  commitActions?: CommitActions
}) {
  const api = useApi()
  const [scope, setScope] = useState<GraphOptions["scope"]>("all")
  const [showRemotes, setShowRemotes] = useState(true)
  const [query, setQuery] = useState("")
  const options: GraphOptions = { scope: searchMode ? "all" : scope, remotes: showRemotes }
  const graph = useQuery(graphQuery(api, summary.id, options))
  const commits = graph.data
  const status = useQuery(worktreeStatusQuery(api, summary.id))

  const searching = searchMode && query.trim() !== ""
  // Message bodies are searched on the server, once typing pauses.
  const searchText = useDebounced(searchMode ? query.trim() : "", 250)
  const messageSearch = useQuery(commitSearchQuery(api, summary.id, options, searchText))
  // Matches for text the user has since changed would be wrong, not just late.
  const messageMatches = searchText === query.trim() ? messageSearch.data : undefined
  // The working tree joins the graph as a virtual node above HEAD while it has changes.
  const showUncommitted = hasChanges(status.data) && !searching && !!commits
  const layout = useMemo(() => {
    if (!commits) return []
    return layoutGraph(showUncommitted ? withUncommittedChanges(commits, summary.head) : commits)
  }, [commits, showUncommitted, summary.head])
  const rows: HistoryRow[] = useMemo(() => {
    if (!commits) return []
    if (searching)
      return searchCommits(commits, query, messageMatches).map((commit) => ({
        oid: commit.oid,
        commit,
        graph: SEARCH_ROW,
      }))
    const offset = showUncommitted ? 1 : 0
    const commitRows = commits.map((commit, index) => ({
      oid: commit.oid,
      commit,
      graph: layout[index + offset] ?? SEARCH_ROW,
    }))
    return showUncommitted ? [{ oid: UNCOMMITTED, graph: layout[0] ?? SEARCH_ROW }, ...commitRows] : commitRows
  }, [commits, layout, searching, query, messageMatches, showUncommitted])
  const indexByOid = useMemo(() => new Map(rows.map((row, index) => [row.oid, index])), [rows])
  const graphWidth = useMemo(() => {
    let lanes = 1
    for (const row of rows) lanes = Math.max(lanes, row.graph.width)
    return graphColumnWidth(lanes)
  }, [rows])
  const refsMap = useMemo(() => refsByCommit(refs, showRemotes), [refs, showRemotes])
  const headHistory = useMemo(() => reachableFrom(commits ?? [], summary.head), [commits, summary.head])
  // Selecting "未提交的更改" falls back to HEAD once the working tree is clean again.
  const selectedOid =
    selection?.oid === UNCOMMITTED && !showUncommitted ? summary.head : (selection?.oid ?? summary.head)
  // A search that filters out the selected commit hides its details; they come back with it.
  const selectionHidden = searching && !!commits && !!selectedOid && !indexByOid.has(selectedOid)
  const columns = `${graphWidth}px minmax(0,1fr) 6.5rem minmax(0,15rem) 8.5rem`

  const list = useVirtualWindow(rows.length)
  const { scrollToIndex } = list

  // Scroll a requested commit into view once it is in the list. If the filters hide it, widen them
  // to every branch including remotes; if it is still missing, give up.
  const [pending, setPending] = useState<string>()
  useEffect(() => {
    if (selection) setPending(selection.oid)
  }, [selection])
  const filtersNarrowed = !searchMode && (scope !== "all" || !showRemotes)
  useEffect(() => {
    if (!pending || !commits || graph.isPlaceholderData) return
    const index = indexByOid.get(pending)
    if (index !== undefined) {
      scrollToIndex(index)
      setPending(undefined)
    } else if (filtersNarrowed) {
      setScope("all")
      setShowRemotes(true)
    } else {
      setPending(undefined)
    }
  }, [pending, commits, graph.isPlaceholderData, indexByOid, filtersNarrowed, scrollToIndex])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const current = selectedOid ? (indexByOid.get(selectedOid) ?? -1) : -1
    const next = rows[Math.max(0, Math.min(rows.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))]
    if (next) onSelect(next.oid)
  }

  const jumpTargets = [
    ...(refs?.branches ?? []).map((branch) => ({ name: branch.name, oid: branch.oid })),
    ...(refs?.remotes ?? []).flatMap((remote) =>
      remote.branches.map((branch) => ({ name: branch.name, oid: branch.oid })),
    ),
  ]

  let message: string | undefined
  if (graph.error) message = `无法加载历史：${graph.error.message}`
  else if (!commits) message = "正在加载历史…"
  else if (commits.length === 0 && !showUncommitted) message = "仓库还没有提交。"
  else if (rows.length === 0) message = "没有匹配的提交。"

  return (
    <ResizablePanelGroup orientation="vertical">
      <ResizablePanel defaultSize="58%" minSize="20%">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-7 shrink-0 items-center gap-4 border-b bg-muted/40 px-3 text-[11px]">
            {searchMode ? (
              <span className="flex items-center gap-1 rounded border bg-background px-1.5">
                <Search className="size-3 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索提交信息、作者或哈希"
                  aria-label="搜索提交"
                  className="h-5 w-64 bg-transparent outline-none"
                />
              </span>
            ) : (
              <select
                aria-label="分支范围"
                className={filterSelect}
                value={scope}
                onChange={(event) => setScope(event.target.value === "current" ? "current" : "all")}
              >
                <option value="all">所有分支</option>
                <option value="current">当前分支</option>
              </select>
            )}
            <select
              aria-label="远程分支"
              className={filterSelect}
              value={showRemotes ? "show" : "hide"}
              onChange={(event) => setShowRemotes(event.target.value === "show")}
            >
              <option value="show">显示远程分支</option>
              <option value="hide">隐藏远程分支</option>
            </select>
            <select aria-label="排序" className={filterSelect} defaultValue="date" disabled title="暂不支持">
              <option value="date">按日期排序</option>
            </select>
            <select aria-label="视图" className={filterSelect} defaultValue="expanded" disabled title="暂不支持">
              <option value="expanded">扩展视图</option>
            </select>
            <label className="ml-auto flex items-center gap-1">
              跳转到：
              <select
                className={cn(filterSelect, "max-w-48")}
                value=""
                onChange={(event) => {
                  const target = jumpTargets.find((item) => item.name === event.target.value)
                  if (target) onSelect(target.oid)
                }}
              >
                <option value="" disabled>
                  {" "}
                </option>
                {jumpTargets.map((target) => (
                  <option key={target.name} value={target.name}>
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="grid shrink-0 overflow-hidden border-b text-[11px] text-muted-foreground [scrollbar-gutter:stable]"
            style={{ gridTemplateColumns: columns }}
          >
            <span className="px-2 py-1">图表</span>
            <span className="px-2 py-1">描述</span>
            <span className="px-2 py-1">提交</span>
            <span className="px-2 py-1">作者</span>
            <span className="px-2 py-1">日期</span>
          </div>
          <div
            ref={list.ref}
            role="listbox"
            tabIndex={0}
            onScroll={list.onScroll}
            onKeyDown={onKeyDown}
            onClick={(event) => {
              const oid = (event.target as Element).closest<HTMLElement>("[data-oid]")?.dataset.oid
              if (oid) onSelect(oid)
            }}
            aria-label="提交列表"
            aria-busy={!commits}
            aria-activedescendant={selectedOid && indexByOid.has(selectedOid) ? `commit-${selectedOid}` : undefined}
            className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
          >
            {message ? (
              <p className={cn("px-3 py-2 text-muted-foreground", graph.error && "text-destructive")}>{message}</p>
            ) : (
              <div style={{ height: rows.length * ROW_HEIGHT }}>
                {rows.slice(list.range.start, list.range.end).map((row, offset) => {
                  const index = list.range.start + offset
                  const { commit } = row
                  const isSelected = row.oid === selectedOid
                  const isHead = row.oid === summary.head
                  const element = (
                    <div
                      key={row.oid}
                      id={`commit-${row.oid}`}
                      role="option"
                      tabIndex={-1}
                      data-oid={row.oid}
                      aria-selected={isSelected}
                      className={cn(
                        "absolute left-0 grid w-full cursor-default items-center text-left",
                        isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent/50",
                      )}
                      style={{ gridTemplateColumns: columns, height: ROW_HEIGHT, top: index * ROW_HEIGHT }}
                    >
                      <GraphCell row={row.graph} width={graphWidth} hollow={isHead} virtual={!commit} />
                      {commit ? (
                        <>
                          <span className="flex min-w-0 items-center gap-1 overflow-hidden px-2">
                            {(refsMap.get(commit.oid) ?? []).map((ref) => (
                              <RefLabel
                                key={`${ref.kind}:${ref.name}`}
                                refInfo={ref}
                                color={laneColor(row.graph.color)}
                              />
                            ))}
                            <span className={cn("truncate", isHead && "font-semibold")} title={commit.subject}>
                              {commit.subject}
                            </span>
                          </span>
                          <span className="truncate px-2 font-mono text-[11px] opacity-90">
                            {commit.oid.slice(0, 10)}
                          </span>
                          <span
                            className={cn("truncate px-2 opacity-90", isHead && "font-semibold")}
                            title={`${commit.author} <${commit.email}>`}
                          >
                            {commit.author} &lt;{commit.email}&gt;
                          </span>
                          <span className={cn("truncate px-2 tabular-nums opacity-90", isHead && "font-semibold")}>
                            {formatRelativeDate(new Date(commit.authorTime * 1000))}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="truncate px-2 font-medium">未提交的更改</span>
                          <span className="px-2 font-mono text-[11px] opacity-90">*</span>
                          <span className="px-2 opacity-90">*</span>
                          <span className="px-2 opacity-90">*</span>
                        </>
                      )}
                    </div>
                  )
                  if (!commit) return element
                  return (
                    <CommitContextMenu
                      key={row.oid}
                      commit={commit}
                      summary={summary}
                      inHead={headHistory.has(commit.oid)}
                      actions={commitActions}
                      onOpen={() => onSelect(commit.oid)}
                    >
                      {element}
                    </CommitContextMenu>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle orientation="vertical" />
      <ResizablePanel minSize="20%">
        <section className="h-full" aria-label="提交详情">
          {selectionHidden ? (
            <p role="status" className="p-4 text-muted-foreground">
              所选提交不在搜索结果中
            </p>
          ) : selectedOid === UNCOMMITTED && status.data ? (
            <UncommittedChanges repoId={summary.id} status={status.data} />
          ) : selectedOid && selectedOid !== UNCOMMITTED ? (
            <CommitDetails
              key={selectedOid}
              repoId={summary.id}
              oid={selectedOid}
              refs={refsMap.get(selectedOid) ?? []}
              onSelect={onSelect}
            />
          ) : (
            <p className="p-4 text-muted-foreground">选择一个提交查看详情</p>
          )}
        </section>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
