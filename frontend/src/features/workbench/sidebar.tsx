import { ChevronDown, FolderGit2, Monitor, Network, Search } from "lucide-react"
import { useState } from "react"
import type { StashAction } from "@/features/stash/stash-sheets"
import type { Refs } from "@/lib/api/history"
import type { RepoSummary } from "@/lib/api/repos"
import type { Stash } from "@/lib/api/stashes"
import { cn } from "@/lib/utils"
import { Row, Section } from "./sidebar-parts"
import { BranchesSection, RemotesSection, TagsSection } from "./sidebar-refs"
import { StashesSection } from "./sidebar-stashes"

/** The main area: a WORKSPACE view, or the stash selected under 已贮藏. */
export type WorkbenchView = "status" | "history" | "search" | "stash"

const VIEWS: [Exclude<WorkbenchView, "stash">, string][] = [
  ["status", "文件状态"],
  ["history", "历史"],
  ["search", "搜索"],
]

/**
 * Repository navigation: WORKSPACE views, then branches, tags, remotes,
 * stashes, submodules and subtrees, with a name filter at the bottom.
 */
export function Sidebar({
  summary,
  refs,
  view,
  onView,
  onReveal,
  selectedStash,
  onSelectStash,
  onStashAction,
}: {
  summary: RepoSummary
  /** Branches, remotes and tags; undefined while loading. */
  refs?: Refs
  view: WorkbenchView
  onView: (view: WorkbenchView) => void
  /** Show a commit in the history view. */
  onReveal: (oid: string) => void
  /** Oid of the stash shown when `view` is "stash". */
  selectedStash?: string
  onSelectStash: (stash: Stash) => void
  /** Asks to apply or delete a stash; the caller confirms first. */
  onStashAction: (action: StashAction) => void
}) {
  const [filter, setFilter] = useState("")
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const needle = filter.trim().toLowerCase()
  const match = (name: string) => name.toLowerCase().includes(needle)

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

        <BranchesSection summary={summary} refs={refs} filter={match} onReveal={onReveal} />
        <TagsSection refs={refs} filter={match} onReveal={onReveal} />
        <RemotesSection refs={refs} filter={match} onReveal={onReveal} />
        <StashesSection
          repoId={summary.id}
          selected={view === "stash" ? selectedStash : undefined}
          onSelect={onSelectStash}
          onAction={onStashAction}
        />
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
