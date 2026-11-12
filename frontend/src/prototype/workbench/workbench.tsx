// PROTOTYPE — Sourcetree-style web workbench, checked against docs/prototype/sourcetree/*.webp.
// Layout: title-bar toolbar / sidebar (workspace, branch tree, tags, remotes, stashes) /
// file status or history graph / file list + commit details + diff. Data is in-memory mock.
import {
  Archive,
  ChevronDown,
  ChevronRight,
  CircleArrowDown,
  CircleArrowUp,
  CircleDashed,
  CirclePlus,
  Clock,
  Cloud,
  Ellipsis,
  Folder,
  FolderGit2,
  GitBranch,
  GitMerge,
  Globe,
  type LucideIcon,
  Monitor,
  Network,
  Search,
  Settings,
  Tag,
} from "lucide-react"
import { ContextMenu } from "radix-ui"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { cn } from "@/lib/utils"
import {
  aheadBehind,
  type ChangedFile,
  type Commit,
  createInitialState,
  fakeHash,
  lookupCommit,
  type RepoState,
} from "./data"
import { type DialogKind, mergeInto, OperationDialog, type RunOperation } from "./dialogs"
import { DiffView, StatusIcon } from "./diff-view"
import { type GraphRow, laneColor, layoutGraph } from "./graph"

type View = "status" | "history" | "search"
const WORKTREE = "WORKTREE"
const ROW_HEIGHT = 24
const LANE_WIDTH = 13

export function Workbench() {
  const [state, setState] = useState<RepoState>(createInitialState)
  const [view, setView] = useState<View>("history")
  const [selectedOid, setSelectedOid] = useState<string>(WORKTREE)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const run: RunOperation = (command, mutate) => {
    setState((current) => {
      const next = mutate ? mutate(current) : current
      return { ...next, commandLog: [...next.commandLog, command] }
    })
    setDialog(null)
    setToast(`原型：已模拟执行 ${command}`)
  }

  const head = state.branches[state.currentBranch]
  const { ahead, behind } = aheadBehind(state, state.currentBranch)
  const changeCount = state.staged.length + state.unstaged.length

  const reveal = (oid: string | undefined) => {
    if (!oid) return
    setView("history")
    setSelectedOid(oid)
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TitleBar
        repo={state}
        changeCount={changeCount}
        ahead={ahead}
        behind={behind}
        onCommit={() => setView("status")}
        onOpen={setDialog}
      />
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="18%" minSize="12%" maxSize="32%">
            <Sidebar state={state} view={view} onView={setView} onReveal={reveal} run={run} />
          </ResizablePanel>
          <ResizableHandle orientation="horizontal" />
          <ResizablePanel>
            {view === "status" ? (
              <FileStatusView state={state} setState={setState} run={run} />
            ) : (
              <HistoryView
                state={state}
                head={head}
                selectedOid={selectedOid}
                onSelect={setSelectedOid}
                searchMode={view === "search"}
              />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <CommandBar state={state} />
      {dialog && <OperationDialog kind={dialog} state={state} onClose={() => setDialog(null)} run={run} />}
      {toast && (
        <div className="fixed right-4 bottom-8 z-50 max-w-md rounded-md border bg-popover px-3 py-2 font-mono text-[11px] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- title bar */

function ToolbarButton({
  icon: Icon,
  label,
  badge,
  onClick,
  disabled,
}: {
  icon: LucideIcon
  label: string
  badge?: number
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative flex min-w-11 flex-col items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon className="size-[18px] text-primary" strokeWidth={1.6} />
      <span className="whitespace-nowrap">{label}</span>
      {!!badge && (
        <span className="absolute top-0 left-1/2 ml-1 min-w-3.5 rounded-full bg-primary px-1 text-[9px] leading-3.5 text-primary-foreground">
          {badge}
        </span>
      )}
    </button>
  )
}

function TitleBar({
  repo,
  changeCount,
  ahead,
  behind,
  onCommit,
  onOpen,
}: {
  repo: RepoState
  changeCount: number
  ahead: number
  behind: number
  onCommit: () => void
  onOpen: (kind: DialogKind) => void
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-muted/40 pr-2 pl-4">
      <h1 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{repo.name} (Git)</h1>
      <ToolbarButton icon={CirclePlus} label="提交" badge={changeCount} onClick={onCommit} />
      <span className="w-2" />
      <ToolbarButton icon={CircleArrowDown} label="拉取" badge={behind} onClick={() => onOpen("pull")} />
      <ToolbarButton icon={CircleArrowUp} label="推送" badge={ahead} onClick={() => onOpen("push")} />
      <ToolbarButton icon={CircleDashed} label="抓取" onClick={() => onOpen("fetch")} />
      <span className="w-2" />
      <ToolbarButton icon={GitBranch} label="分支" onClick={() => onOpen("branch")} />
      <ToolbarButton icon={GitMerge} label="合并" onClick={() => onOpen("merge")} />
      <span className="w-2" />
      <ToolbarButton icon={Archive} label="贮藏" onClick={() => onOpen("stash")} />
      <span className="w-2" />
      <ToolbarButton icon={Globe} label="显示远程服务器" disabled />
      <ToolbarButton icon={Monitor} label="在 Finder 中显示" disabled />
      <ToolbarButton icon={Settings} label="设置" disabled />
    </header>
  )
}

/* ---------------------------------------------------------------- sidebar */

type TreeNode = { name: string; path?: string; children: TreeNode[] }

function buildTree(names: string[]): TreeNode[] {
  const root: TreeNode = { name: "", children: [] }
  for (const name of names) {
    let node = root
    const parts = name.split("/")
    parts.forEach((part, index) => {
      const leaf = index === parts.length - 1
      let child = node.children.find((item) => item.name === part && !item.path === !leaf)
      if (!child) {
        child = { name: part, path: leaf ? name : undefined, children: [] }
        node.children.push(child)
      }
      node = child
    })
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => Number(!!a.path) - Number(!!b.path) || a.name.localeCompare(b.name))
    for (const node of nodes) sort(node.children)
  }
  sort(root.children)
  return root.children
}

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
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

function Row({
  depth,
  active,
  onClick,
  onDoubleClick,
  title,
  children,
}: {
  depth: number
  active?: boolean
  onClick?: () => void
  onDoubleClick?: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
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

function BranchTree({
  nodes,
  depth,
  state,
  remote,
  onReveal,
  run,
}: {
  nodes: TreeNode[]
  depth: number
  state: RepoState
  remote: boolean
  onReveal: (oid: string | undefined) => void
  run: RunOperation
}) {
  return nodes.map((node) =>
    node.path ? (
      remote ? (
        <Row key={node.path} depth={depth} onClick={() => onReveal(state.remoteBranches[`origin/${node.path}`])}>
          <span className="truncate">{node.name}</span>
        </Row>
      ) : (
        <LocalBranchRow
          key={node.path}
          branch={node.path}
          label={node.name}
          depth={depth}
          state={state}
          onReveal={onReveal}
          run={run}
        />
      )
    ) : (
      <FolderRow key={`${node.name}-${depth}`} node={node} depth={depth}>
        <BranchTree
          nodes={node.children}
          depth={depth + 1}
          state={state}
          remote={remote}
          onReveal={onReveal}
          run={run}
        />
      </FolderRow>
    ),
  )
}

function FolderRow({ node, depth, children }: { node: TreeNode; depth: number; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <Row depth={depth - 1} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <Folder className="size-3.5 shrink-0" strokeWidth={1.5} />
        <span className="truncate">{node.name}</span>
      </Row>
      {open && children}
    </>
  )
}

function LocalBranchRow({
  branch,
  label,
  depth,
  state,
  onReveal,
  run,
}: {
  branch: string
  label: string
  depth: number
  state: RepoState
  onReveal: (oid: string | undefined) => void
  run: RunOperation
}) {
  const current = branch === state.currentBranch
  const { ahead, behind } = aheadBehind(state, branch)
  const upstream = state.upstream[branch]
  const checkout = () => run(`git checkout ${branch}`, (s) => ({ ...s, currentBranch: branch }))
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div>
          <Row
            depth={depth}
            title="单击定位到提交，双击检出，右键查看更多操作"
            onClick={() => onReveal(state.branches[branch])}
            onDoubleClick={() => !current && checkout()}
          >
            <span className={cn("-ml-3.5 size-2 shrink-0 rounded-full", current ? "bg-chart-5" : "bg-transparent")} />
            <span className={cn("truncate", current && "font-semibold")}>{label}</span>
            {(ahead > 0 || behind > 0) && (
              <span className="ml-auto shrink-0 rounded bg-muted-foreground/60 px-1 text-[10px] leading-4 text-background">
                {ahead > 0 && `${ahead}↑`}
                {behind > 0 && `${behind}↓`}
              </span>
            )}
          </Row>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-64 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
          <MenuItem disabled={current} onSelect={checkout}>
            检出 {branch}
          </MenuItem>
          <MenuItem disabled={current} onSelect={() => run(`git merge ${branch}`, (s) => mergeInto(s, branch))}>
            合并 {branch} 至 {state.currentBranch}
          </MenuItem>
          <MenuItem disabled={current} onSelect={() => run(`git rebase ${branch}`)}>
            将当前变更变基到 {branch}
          </MenuItem>
          <MenuSeparator />
          <MenuItem disabled={!upstream} onSelect={() => run(`git fetch origin ${branch}:${branch}`)}>
            拿来 {branch}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            disabled={!upstream}
            onSelect={() =>
              run(`git push origin ${branch}`, (s) => {
                const head = s.branches[branch]
                return head && upstream ? { ...s, remoteBranches: { ...s.remoteBranches, [upstream]: head } } : s
              })
            }
          >
            推送到 {upstream ?? "origin"}
            {upstream && "（已跟踪）"}
          </MenuItem>
          <SubMenu label="推送到">
            <MenuItem onSelect={() => run(`git push origin ${branch}`)}>origin</MenuItem>
          </SubMenu>
          <SubMenu label="跟踪远程分支">
            {Object.keys(state.remoteBranches)
              .filter((name) => name !== "origin/HEAD")
              .map((name) => (
                <MenuItem
                  key={name}
                  onSelect={() =>
                    run(`git branch --set-upstream-to=${name} ${branch}`, (s) => ({
                      ...s,
                      upstream: { ...s.upstream, [branch]: name },
                    }))
                  }
                >
                  {name}
                </MenuItem>
              ))}
          </SubMenu>
          <MenuSeparator />
          <MenuItem disabled={current} onSelect={() => onReveal(state.branches[branch])}>
            与当前对比
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => run(`git branch -m ${branch} <新名称>`)}>重命名…</MenuItem>
          <MenuItem
            disabled={current}
            onSelect={() =>
              run(`git branch -d ${branch}`, (s) => {
                const branches = { ...s.branches }
                delete branches[branch]
                return { ...s, branches }
              })
            }
          >
            删除 {branch}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => void navigator.clipboard?.writeText(branch)}>复制分支名字</MenuItem>
          <MenuSeparator />
          <MenuItem disabled>创建拉取请求…</MenuItem>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

const menuItemClass =
  "flex cursor-default items-center rounded px-2 py-1 outline-none select-none data-[disabled]:text-muted-foreground/60 data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground"

function MenuItem({
  children,
  onSelect,
  disabled,
}: {
  children: ReactNode
  onSelect?: () => void
  disabled?: boolean
}) {
  return (
    <ContextMenu.Item className={menuItemClass} disabled={disabled} onSelect={onSelect}>
      {children}
    </ContextMenu.Item>
  )
}

function MenuSeparator() {
  return <ContextMenu.Separator className="mx-2 my-1 h-px bg-border" />
}

function SubMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger className={menuItemClass}>
        {label}
        <ChevronRight className="ml-auto size-3.5" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent className="z-50 min-w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl">
          {children}
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  )
}

function Sidebar({
  state,
  view,
  onView,
  onReveal,
  run,
}: {
  state: RepoState
  view: View
  onView: (view: View) => void
  onReveal: (oid: string | undefined) => void
  run: RunOperation
}) {
  const [filter, setFilter] = useState("")
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [originOpen, setOriginOpen] = useState(false)
  const match = (name: string) => name.toLowerCase().includes(filter.trim().toLowerCase())
  const localTree = buildTree(Object.keys(state.branches).filter(match))
  const remoteTree = buildTree(
    Object.keys(state.remoteBranches)
      .filter((name) => name !== "origin/HEAD" && match(name))
      .map((name) => name.replace(/^origin\//, "")),
  )

  return (
    <div className="flex h-full flex-col border-r bg-muted/50">
      <nav className="min-h-0 flex-1 overflow-y-auto pb-4" aria-label="仓库导航">
        <button
          type="button"
          onClick={() => setWorkspaceOpen(!workspaceOpen)}
          className="mt-2 flex w-full items-center gap-2 px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground"
        >
          <Monitor className="size-4" strokeWidth={1.5} />
          WORKSPACE
          <ChevronDown className={cn("ml-auto size-3", !workspaceOpen && "-rotate-90")} />
        </button>
        {workspaceOpen &&
          (
            [
              ["status", "文件状态"],
              ["history", "历史"],
              ["search", "搜索"],
            ] as const
          ).map(([key, label]) => (
            <Row key={key} depth={1} active={view === key} onClick={() => onView(key)}>
              {label}
            </Row>
          ))}

        <Section icon={GitBranch} title="分支">
          <BranchTree nodes={localTree} depth={1} state={state} remote={false} onReveal={onReveal} run={run} />
        </Section>
        <Section icon={Tag} title="标签">
          {Object.keys(state.tags)
            .filter(match)
            .map((tag) => (
              <Row key={tag} depth={1} onClick={() => onReveal(state.tags[tag])}>
                {tag}
              </Row>
            ))}
        </Section>
        <Section icon={Cloud} title="远端">
          <Row depth={0} onClick={() => setOriginOpen(!originOpen)}>
            {originOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            origin
          </Row>
          {originOpen && <BranchTree nodes={remoteTree} depth={2} state={state} remote onReveal={onReveal} run={run} />}
        </Section>
        <Section icon={Archive} title="已贮藏">
          {state.stashes.map((stash) => (
            <Row key={stash.name} depth={1} title={stash.name}>
              <span className="truncate">{stash.message}</span>
            </Row>
          ))}
        </Section>
        <Section icon={FolderGit2} title="子模块">
          {null}
        </Section>
        <Section icon={Network} title="子树">
          {null}
        </Section>
      </nav>
      <div className="flex shrink-0 items-center gap-1.5 border-t px-2 py-1.5">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="筛选器"
          className="h-5 min-w-0 flex-1 rounded bg-muted px-1.5 outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ file status */

function shortenPath(path: string, max = 42): string {
  return path.length > max ? `…${path.slice(path.length - max + 1)}` : path
}

function PaneBar({ children }: { children: ReactNode }) {
  return <div className="flex h-7 shrink-0 items-center gap-2 border-b bg-muted/40 px-3 text-[11px]">{children}</div>
}

function SortMenu({ label }: { label: string }) {
  return (
    <>
      <span className="flex items-center gap-0.5">
        {label}
        <ChevronDown className="size-3" />
      </span>
      <span className="flex items-center gap-0.5 text-muted-foreground">
        <Ellipsis className="size-3.5" />
        <ChevronDown className="size-3" />
      </span>
    </>
  )
}

function DiffSearch() {
  return (
    <span className="ml-auto flex items-center gap-1 rounded border bg-background px-1.5">
      <Search className="size-3 text-muted-foreground" />
      <input placeholder="搜索" aria-label="在差异中搜索" className="h-5 w-32 bg-transparent outline-none" />
    </span>
  )
}

function StageSection({
  title,
  files,
  staged,
  selected,
  onSelect,
  onToggle,
  onToggleAll,
}: {
  title: string
  files: ChangedFile[]
  staged: boolean
  selected?: string
  onSelect: (path: string) => void
  onToggle: (path: string) => void
  onToggleAll: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <label className="flex h-8 shrink-0 items-center gap-2 px-3">
        <input type="checkbox" checked={staged && files.length > 0} disabled={!files.length} onChange={onToggleAll} />
        {title}
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {files.map((file) => (
          <div
            key={file.path}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-[3px]",
              selected === file.path ? "bg-primary text-primary-foreground" : "hover:bg-accent/60",
            )}
          >
            <input
              type="checkbox"
              aria-label={`${staged ? "取消暂存" : "暂存"} ${file.path}`}
              checked={staged}
              onChange={() => onToggle(file.path)}
            />
            <StatusIcon status={file.status} />
            <button
              type="button"
              title={file.path}
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => onSelect(file.path)}
            >
              {shortenPath(file.path)}
            </button>
            <Ellipsis className="size-4 shrink-0 opacity-70" />
          </div>
        ))}
      </div>
    </div>
  )
}

function FileStatusView({
  state,
  setState,
  run,
}: {
  state: RepoState
  setState: (update: (state: RepoState) => RepoState) => void
  run: RunOperation
}) {
  const [selected, setSelected] = useState<{ path: string; area: "staged" | "unstaged" } | undefined>(() => {
    const first = state.staged[0] ?? state.unstaged[0]
    return first ? { path: first.path, area: state.staged[0] ? "staged" : "unstaged" } : undefined
  })
  const [message, setMessage] = useState("")
  const [pushAfter, setPushAfter] = useState(false)
  const [amend, setAmend] = useState(false)

  const move = (path: string, from: "staged" | "unstaged") => {
    const to = from === "staged" ? "unstaged" : "staged"
    setState((current) => {
      const file = current[from].find((item) => item.path === path)
      if (!file) return current
      return {
        ...current,
        [from]: current[from].filter((item) => item.path !== path),
        [to]: [...current[to], file],
        commandLog: [
          ...current.commandLog,
          from === "unstaged" ? `git add -- ${path}` : `git restore --staged -- ${path}`,
        ],
      }
    })
    if (selected?.path === path) setSelected({ path, area: to })
  }
  const moveAll = (from: "staged" | "unstaged") => {
    for (const file of state[from]) move(file.path, from)
  }
  const discard = (path: string) =>
    run(`git restore -- ${path}`, (current) => ({
      ...current,
      unstaged: current.unstaged.filter((item) => item.path !== path),
    }))

  const selectedFile = selected ? state[selected.area].find((file) => file.path === selected.path) : undefined
  const canCommit = (state.staged.length > 0 || amend) && message.trim().length > 0
  const upstream = state.upstream[state.currentBranch] ?? `origin/${state.currentBranch}`

  const commit = () => {
    const subject = message.trim().split("\n")[0] ?? ""
    const command = `git commit${amend ? " --amend" : ""} -m "${subject}"${pushAfter ? " && git push" : ""}`
    run(command, (current) => {
      const parent = current.branches[current.currentBranch]
      if (!parent) return current
      const previous = lookupCommit(current, parent)
      const oid = fakeHash(message)
      const created: Commit = {
        oid,
        parents: amend && previous ? previous.parents : [parent],
        subject,
        body: message.trim().split("\n").slice(1).join("\n").trim() || undefined,
        author: "Neil",
        email: "neil@example.com",
        date: new Date(),
        files: amend && previous ? [...previous.files, ...current.staged] : current.staged,
      }
      const commits = amend ? current.commits.filter((item) => item.oid !== parent) : current.commits
      const branches = { ...current.branches, [current.currentBranch]: oid }
      const upstreamName = current.upstream[current.currentBranch]
      const remoteBranches =
        pushAfter && upstreamName ? { ...current.remoteBranches, [upstreamName]: oid } : current.remoteBranches
      return { ...current, commits: [created, ...commits], branches, remoteBranches, staged: [] }
    })
    setMessage("")
    setAmend(false)
  }

  return (
    <ResizablePanelGroup orientation="vertical">
      <ResizablePanel defaultSize="72%" minSize="40%">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="36%" minSize="20%">
            <div className="flex h-full min-h-0 flex-col">
              <PaneBar>
                <SortMenu label="待定的文件，已依照路径排序" />
              </PaneBar>
              <div className="min-h-0 flex-1">
                <ResizablePanelGroup orientation="vertical">
                  <ResizablePanel defaultSize="50%" minSize="15%">
                    <StageSection
                      title="已暂存文件"
                      files={state.staged}
                      staged
                      selected={selected?.area === "staged" ? selected.path : undefined}
                      onSelect={(path) => setSelected({ path, area: "staged" })}
                      onToggle={(path) => move(path, "staged")}
                      onToggleAll={() => moveAll("staged")}
                    />
                  </ResizablePanel>
                  <ResizableHandle orientation="vertical" />
                  <ResizablePanel minSize="15%">
                    <StageSection
                      title="未暂存文件"
                      files={state.unstaged}
                      staged={false}
                      selected={selected?.area === "unstaged" ? selected.path : undefined}
                      onSelect={(path) => setSelected({ path, area: "unstaged" })}
                      onToggle={(path) => move(path, "unstaged")}
                      onToggleAll={() => moveAll("unstaged")}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle orientation="horizontal" />
          <ResizablePanel>
            <div className="flex h-full min-h-0 flex-col">
              <PaneBar>
                <DiffSearch />
              </PaneBar>
              <div className="min-h-0 flex-1">
                <DiffView
                  file={selectedFile}
                  hunkActions={
                    !selectedFile
                      ? []
                      : selected?.area === "staged"
                        ? [{ label: "取消暂存区块", onClick: () => move(selectedFile.path, "staged") }]
                        : [
                            { label: "丢弃区块", tone: "danger", onClick: () => discard(selectedFile.path) },
                            { label: "暂存区块", onClick: () => move(selectedFile.path, "unstaged") },
                          ]
                  }
                />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle orientation="vertical" />
      <ResizablePanel minSize="18%">
        <div className="flex h-full flex-col gap-2 bg-muted/30 px-3 pt-2 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground">
              N
            </span>
            <span className="font-semibold">Neil &lt;neil@example.com&gt;</span>
            <span className="ml-auto flex items-center gap-0.5 text-muted-foreground">
              <Clock className="size-3.5" />
              <ChevronDown className="size-3" />
            </span>
            <span className="flex items-center gap-0.5">
              提交选项…
              <ChevronDown className="size-3" />
            </span>
          </div>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-label="提交信息"
            className="min-h-0 flex-1 resize-none rounded border bg-background p-2 outline-none focus:ring-2 focus:ring-ring/40"
          />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={pushAfter} onChange={(event) => setPushAfter(event.target.checked)} />
              立即推送变更到 {upstream}
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={amend} onChange={(event) => setAmend(event.target.checked)} />
              更正上一次提交
            </label>
            <button
              type="button"
              onClick={() => setMessage("")}
              className="ml-auto h-6 min-w-14 rounded-md border bg-background px-3 shadow-xs"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!canCommit}
              onClick={commit}
              className="h-6 min-w-14 rounded-md bg-primary px-3 text-primary-foreground shadow-xs disabled:opacity-40"
            >
              提交
            </button>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

/* ---------------------------------------------------------------- history */

type HistoryRow = { oid: string; commit?: Commit; graph: GraphRow }

function reachable(state: RepoState, from: string | undefined): Set<string> {
  const seen = new Set<string>()
  const stack = from ? [from] : []
  while (stack.length) {
    const next = stack.pop()
    if (!next || seen.has(next)) continue
    seen.add(next)
    for (const parent of lookupCommit(state, next)?.parents ?? []) stack.push(parent)
  }
  return seen
}

const filterSelect = "h-5 rounded bg-transparent pr-1 hover:bg-accent"

function HistoryView({
  state,
  head,
  selectedOid,
  onSelect,
  searchMode,
}: {
  state: RepoState
  head?: string
  selectedOid: string
  onSelect: (oid: string) => void
  searchMode: boolean
}) {
  const [scope, setScope] = useState<"all" | "current">("all")
  const [showRemotes, setShowRemotes] = useState(true)
  const [query, setQuery] = useState("")
  const dirty = state.staged.length + state.unstaged.length > 0

  const rows: HistoryRow[] = useMemo(() => {
    const visible = scope === "current" ? reachable(state, head) : undefined
    const needle = query.trim().toLowerCase()
    let commits = state.commits.filter((commit) => !visible || visible.has(commit.oid))
    if (!showRemotes) {
      const local = new Set<string>()
      for (const oid of Object.values(state.branches)) for (const item of reachable(state, oid)) local.add(item)
      commits = commits.filter((commit) => local.has(commit.oid))
    }
    if (searchMode && needle) {
      commits = commits.filter(
        (commit) =>
          commit.subject.toLowerCase().includes(needle) ||
          commit.author.toLowerCase().includes(needle) ||
          commit.oid.startsWith(needle),
      )
    }
    const nodes = [
      ...(dirty && head && !(searchMode && needle) ? [{ oid: WORKTREE, parents: [head] }] : []),
      ...commits.map((commit) => ({ oid: commit.oid, parents: commit.parents })),
    ]
    const graph = layoutGraph(nodes)
    return nodes.map((node, index) => ({
      oid: node.oid,
      commit: commits.find((commit) => commit.oid === node.oid),
      graph: graph[index] ?? { lane: 0, color: 0, segments: [], width: 1 },
    }))
  }, [state, head, scope, showRemotes, dirty, searchMode, query])

  const graphWidth = Math.max(Math.max(...rows.map((row) => row.graph.width), 1) * LANE_WIDTH + 10, 64)
  const refs = useMemo(() => collectRefs(state, showRemotes), [state, showRemotes])
  const selected = rows.find((row) => row.oid === selectedOid) ?? rows[0]
  const columns = `${graphWidth}px minmax(0,1fr) 6.5rem minmax(0,15rem) 8.5rem`

  const selectedRef = useRef<HTMLButtonElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the selection changes
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" })
  }, [selectedOid])

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
            <select aria-label="排序" className={filterSelect} defaultValue="date">
              <option value="date">按日期排序</option>
              <option value="topo">按祖先顺序排序</option>
            </select>
            <select aria-label="视图" className={filterSelect} defaultValue="expanded">
              <option value="expanded">扩展视图</option>
              <option value="compact">紧凑视图</option>
            </select>
            <label className="ml-auto flex items-center gap-1">
              跳转到：
              <select
                className={filterSelect}
                value=""
                onChange={(event) => {
                  const oid = state.branches[event.target.value] ?? state.remoteBranches[event.target.value]
                  if (oid) onSelect(oid)
                }}
              >
                <option value="" disabled>
                  {" "}
                </option>
                {[...Object.keys(state.branches), ...Object.keys(state.remoteBranches)].map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="grid shrink-0 border-b text-[11px] text-muted-foreground"
            style={{ gridTemplateColumns: columns }}
          >
            <span className="px-2 py-1">图表</span>
            <span className="px-2 py-1">描述</span>
            <span className="px-2 py-1">提交</span>
            <span className="px-2 py-1">作者</span>
            <span className="px-2 py-1">日期</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((row) => {
              const isSelected = row.oid === selected?.oid
              const isHead = row.oid === head
              return (
                <button
                  key={row.oid}
                  ref={isSelected ? selectedRef : undefined}
                  type="button"
                  onClick={() => onSelect(row.oid)}
                  className={cn(
                    "grid w-full items-center text-left",
                    isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent/50",
                  )}
                  style={{ gridTemplateColumns: columns, height: ROW_HEIGHT }}
                >
                  <GraphCell row={row.graph} worktree={row.oid === WORKTREE} isHead={isHead} width={graphWidth} />
                  <span className="flex min-w-0 items-center gap-1 overflow-hidden px-2">
                    {row.commit ? (
                      <>
                        {(refs.get(row.oid) ?? []).map((ref) => (
                          <RefLabel
                            key={ref.name}
                            refInfo={ref}
                            color={laneColor(row.graph.color)}
                            behind={ref.kind === "local" ? aheadBehind(state, ref.name).behind : 0}
                          />
                        ))}
                        <span className={cn("truncate", isHead && "font-semibold")}>{row.commit.subject}</span>
                      </>
                    ) : (
                      <span className="font-medium">未提交的更改</span>
                    )}
                  </span>
                  <span className="truncate px-2 font-mono text-[11px] opacity-90">
                    {row.commit ? row.oid.slice(0, 10) : "*"}
                  </span>
                  <span className={cn("truncate px-2 opacity-90", isHead && "font-semibold")}>
                    {row.commit ? `${row.commit.author} <${row.commit.email}>` : "*"}
                  </span>
                  <span className={cn("truncate px-2 tabular-nums opacity-90", isHead && "font-semibold")}>
                    {row.commit ? formatRelative(row.commit.date) : "*"}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle orientation="vertical" />
      <ResizablePanel minSize="20%">
        <CommitDetails key={selected?.oid} state={state} row={selected} refs={refs} onSelect={onSelect} />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function GraphCell({
  row,
  worktree,
  isHead,
  width,
}: {
  row: GraphRow
  worktree: boolean
  isHead: boolean
  width: number
}) {
  const x = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2 + 6
  const mid = ROW_HEIGHT / 2
  const color = laneColor(row.color)
  return (
    <svg width={width} height={ROW_HEIGHT} aria-hidden="true" className="block">
      {row.segments.map((segment) => {
        const y1 = segment.half === "top" ? 0 : mid
        const y2 = segment.half === "top" ? mid : ROW_HEIGHT
        const x1 = x(segment.fromLane)
        const x2 = x(segment.toLane)
        const bend = (y2 - y1) / 3
        const path =
          x1 === x2 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} L${x1},${y1 + bend} L${x2},${y2 - bend} L${x2},${y2}`
        return (
          <path
            key={`${segment.half}-${segment.fromLane}-${segment.toLane}`}
            d={path}
            fill="none"
            stroke={laneColor(segment.color)}
            strokeWidth={1.75}
            strokeDasharray={worktree && segment.half === "bottom" ? "3 2" : undefined}
          />
        )
      })}
      {worktree || isHead ? (
        <circle
          cx={x(row.lane)}
          cy={mid}
          r={4}
          fill="var(--background)"
          stroke={worktree ? "var(--muted-foreground)" : color}
          strokeWidth={2}
        />
      ) : (
        <circle cx={x(row.lane)} cy={mid} r={3.5} fill={color} />
      )}
    </svg>
  )
}

type RefInfo = { name: string; kind: "local" | "remote" | "tag" }

function collectRefs(state: RepoState, showRemotes: boolean): Map<string, RefInfo[]> {
  const map = new Map<string, RefInfo[]>()
  const add = (oid: string | undefined, info: RefInfo) => {
    if (!oid) return
    map.set(oid, [...(map.get(oid) ?? []), info])
  }
  if (showRemotes) for (const [name, oid] of Object.entries(state.remoteBranches)) add(oid, { name, kind: "remote" })
  for (const [name, oid] of Object.entries(state.branches)) add(oid, { name, kind: "local" })
  for (const [name, oid] of Object.entries(state.tags)) add(oid, { name, kind: "tag" })
  return map
}

function middleTruncate(text: string, max = 26): string {
  if (text.length <= max) return text
  const keep = Math.floor((max - 1) / 2)
  return `${text.slice(0, keep)}…${text.slice(text.length - keep)}`
}

function RefLabel({ refInfo, color, behind }: { refInfo: RefInfo; color: string; behind: number }) {
  const Icon = refInfo.kind === "tag" ? Tag : GitBranch
  return (
    <>
      <span
        title={refInfo.name}
        style={{ borderColor: `${color}80`, backgroundColor: `${color}26` }}
        className="inline-flex shrink-0 items-center gap-0.5 rounded border px-1 text-[11px] leading-4 text-foreground"
      >
        <Icon className="size-3" strokeWidth={1.75} />
        {middleTruncate(refInfo.name)}
      </span>
      {behind > 0 && (
        <span className="shrink-0 rounded bg-destructive px-1 text-[11px] leading-4 text-white">
          落后{behind}个版本
        </span>
      )}
    </>
  )
}

function CommitDetails({
  state,
  row,
  refs,
  onSelect,
}: {
  state: RepoState
  row?: HistoryRow
  refs: Map<string, RefInfo[]>
  onSelect: (oid: string) => void
}) {
  const files = row?.commit ? row.commit.files : [...state.staged, ...state.unstaged]
  const [selectedPath, setSelectedPath] = useState<string | undefined>(files[0]?.path)
  const selectedFile = files.find((file) => file.path === selectedPath) ?? files[0]

  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize="40%" minSize="20%">
        <div className="flex h-full min-h-0 flex-col">
          <PaneBar>
            <SortMenu label="已依照路径排序" />
          </PaneBar>
          <div className="min-h-0 flex-1">
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel defaultSize="38%" minSize="15%">
                <div className="h-full overflow-y-auto px-2 py-1">
                  {files.length === 0 && (
                    <div className="px-2 py-1 text-muted-foreground">此提交没有文件更改（合并提交）</div>
                  )}
                  {files.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      title={file.path}
                      onClick={() => setSelectedPath(file.path)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-[3px] text-left",
                        selectedFile?.path === file.path ? "bg-muted" : "hover:bg-accent/50",
                      )}
                    >
                      <StatusIcon status={file.status} />
                      <span className="truncate">{file.path}</span>
                    </button>
                  ))}
                </div>
              </ResizablePanel>
              <ResizableHandle orientation="vertical" />
              <ResizablePanel minSize="20%">
                {row?.commit ? (
                  <CommitMeta commit={row.commit} refs={refs.get(row.oid) ?? []} onSelect={onSelect} />
                ) : (
                  <div className="px-4 py-3 font-medium">未提交的更改</div>
                )}
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle orientation="horizontal" />
      <ResizablePanel>
        <div className="flex h-full min-h-0 flex-col">
          <PaneBar>
            <DiffSearch />
          </PaneBar>
          <div className="min-h-0 flex-1">
            <DiffView
              file={selectedFile}
              hunkActions={selectedFile && row?.commit ? [{ label: "回滚区块", onClick: () => undefined }] : []}
            />
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function CommitMeta({ commit, refs, onSelect }: { commit: Commit; refs: RefInfo[]; onSelect: (oid: string) => void }) {
  return (
    <div className="h-full space-y-2 overflow-y-auto px-4 py-3">
      <div className="flex gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded border bg-primary/15 font-semibold text-primary">
          {commit.author.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="font-medium">{commit.subject}</p>
          {commit.body && <p className="mt-1 whitespace-pre-line text-muted-foreground">{commit.body}</p>}
        </div>
      </div>
      <div className="space-y-0.5">
        <MetaRow label="提交">
          <span className="font-mono">
            {commit.oid} [{commit.oid.slice(0, 10)}]
          </span>
        </MetaRow>
        <MetaRow label="父级">
          {commit.parents.length === 0
            ? "无"
            : commit.parents.map((parent) => (
                <button
                  key={parent}
                  type="button"
                  onClick={() => onSelect(parent)}
                  className="mr-2 font-mono text-primary underline"
                >
                  {parent.slice(0, 10)}
                </button>
              ))}
        </MetaRow>
        <MetaRow label="作者">
          {commit.author} &lt;{commit.email}&gt;
        </MetaRow>
        <MetaRow label="日期">{formatFull(commit.date)}</MetaRow>
        <MetaRow label="提交日期">{formatFull(commit.date)}</MetaRow>
        {refs.length > 0 && <MetaRow label="标签">{refs.map((ref) => ref.name).join(" ")}</MetaRow>}
      </div>
    </div>
  )
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <span className="text-right text-muted-foreground">{label}：</span>
      <span className="min-w-0 break-all">{children}</span>
    </div>
  )
}

/* ---------------------------------------------------- gitview command log */

function CommandBar({ state }: { state: RepoState }) {
  const last = state.commandLog[state.commandLog.length - 1]
  return (
    <footer className="flex h-5 shrink-0 items-center gap-3 border-t bg-muted/40 px-3 text-[10px] text-muted-foreground">
      <span className="min-w-0 flex-1 truncate font-mono">{last ? `$ ${last}` : "命令日志：暂无"}</span>
      <span className="rounded bg-warning/25 px-1.5 text-foreground">原型 · 内存数据</span>
    </footer>
  )
}

/* ---------------------------------------------------------------- dates */

const pad = (value: number) => String(value).padStart(2, "0")

function formatRelative(date: Date): string {
  const now = new Date()
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const diff = Math.round((day(now) - day(date)) / 86_400_000)
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (diff === 0) return `今天 ${time}`
  if (diff === 1) return `昨天 ${time}`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

function formatFull(date: Date): string {
  const offset = -date.getTimezoneOffset() / 60
  const zone = `GMT${offset >= 0 ? "+" : ""}${offset}`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${zone} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
