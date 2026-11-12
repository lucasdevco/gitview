import {
  Archive,
  ChevronDown,
  Cloud,
  FolderGit2,
  GitBranch,
  type LucideIcon,
  Monitor,
  Network,
  Search,
  Tag,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import type { RepoSummary } from "@/lib/api/repos"
import { cn } from "@/lib/utils"

export type WorkbenchView = "status" | "history" | "search"

const VIEWS: [WorkbenchView, string][] = [
  ["status", "文件状态"],
  ["history", "历史"],
  ["search", "搜索"],
]

function Row({
  depth,
  active,
  onClick,
  title,
  children,
}: {
  depth: number
  active?: boolean
  onClick?: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      style={{ paddingLeft: 16 + depth * 14 }}
      className={cn(
        "mx-2 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-md py-[3px] pr-2 text-left",
        active ? "bg-primary text-primary-foreground" : "hover:bg-accent/70",
      )}
    >
      {children}
    </button>
  )
}

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group mt-3 flex w-full items-center gap-2 px-3 py-1 text-muted-foreground"
      >
        <Icon className="size-4" strokeWidth={1.5} />
        <span>{title}</span>
        <ChevronDown className={cn("ml-auto size-3 opacity-0 group-hover:opacity-100", !open && "-rotate-90")} />
      </button>
      {open && <div>{children}</div>}
    </section>
  )
}

function currentBranchLabel(summary: RepoSummary): string {
  if (!summary.detached) return summary.branch
  return `HEAD（分离于 ${summary.head.slice(0, 7)}）`
}

/**
 * Repository navigation: WORKSPACE views, then branches, tags, remotes,
 * stashes, submodules and subtrees, with a name filter at the bottom.
 */
export function Sidebar({
  summary,
  view,
  onView,
}: {
  summary: RepoSummary
  view: WorkbenchView
  onView: (view: WorkbenchView) => void
}) {
  const [filter, setFilter] = useState("")
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const branch = currentBranchLabel(summary)
  const showBranch = branch.toLowerCase().includes(filter.trim().toLowerCase())

  return (
    <div className="flex h-full flex-col border-r bg-muted/50">
      <nav className="min-h-0 flex-1 overflow-y-auto pb-4" aria-label="仓库导航">
        <button
          type="button"
          onClick={() => setWorkspaceOpen(!workspaceOpen)}
          aria-expanded={workspaceOpen}
          className="mt-2 flex w-full items-center gap-2 px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground"
        >
          <Monitor className="size-4" strokeWidth={1.5} />
          WORKSPACE
          <ChevronDown className={cn("ml-auto size-3", !workspaceOpen && "-rotate-90")} />
        </button>
        {workspaceOpen &&
          VIEWS.map(([key, label]) => (
            <Row key={key} depth={1} active={view === key} onClick={() => onView(key)}>
              {label}
            </Row>
          ))}

        <Section icon={GitBranch} title="分支">
          {showBranch && (
            <Row depth={1} title={summary.empty ? `${branch}（尚无提交）` : branch}>
              <span className="-ml-3.5 size-2 shrink-0 rounded-full bg-chart-5" />
              <span className="truncate font-semibold">{branch}</span>
            </Row>
          )}
        </Section>
        <Section icon={Tag} title="标签" />
        <Section icon={Cloud} title="远端" />
        <Section icon={Archive} title="已贮藏" />
        <Section icon={FolderGit2} title="子模块" />
        <Section icon={Network} title="子树" />
      </nav>
      <div className="flex shrink-0 items-center gap-1.5 border-t px-2 py-1.5">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="筛选器"
          aria-label="按名称筛选分支和标签"
          className="h-5 min-w-0 flex-1 rounded bg-muted px-1.5 outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>
    </div>
  )
}
