// PROTOTYPE — operation sheets modelled on Sourcetree's dialogs (docs/prototype/sourcetree/*.webp).
// Each sheet also shows the git command it would run (a gitview addition, after lazygit's command log).
import { GitBranch, MinusCircle } from "lucide-react"
import { Dialog } from "radix-ui"
import { type ReactNode, useState } from "react"
import { cn } from "@/lib/utils"
import type { RepoState } from "./data"

export type DialogKind = "pull" | "push" | "fetch" | "branch" | "merge" | "stash"

export type RunOperation = (command: string, mutate?: (state: RepoState) => RepoState) => void

function Sheet({
  title,
  showTitle = false,
  width = 560,
  command,
  onClose,
  onConfirm,
  confirmLabel = "确定",
  disabled,
  header,
  children,
}: {
  title: string
  showTitle?: boolean
  width?: number
  command: string
  onClose: () => void
  onConfirm: () => void
  confirmLabel?: string
  disabled?: boolean
  header?: ReactNode
  children: ReactNode
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content
          style={{ width }}
          className="fixed top-1/2 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover text-popover-foreground shadow-2xl"
          aria-describedby={undefined}
        >
          {showTitle ? (
            <div className="flex items-start justify-between px-5 pt-4">
              <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
              {header}
            </div>
          ) : (
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
          )}
          <div className="space-y-2.5 px-5 py-4">{children}</div>
          <div className="flex items-center gap-2 px-5 pb-4">
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground" title={command}>
              {command}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="h-6 min-w-20 rounded-md border bg-background px-3 shadow-xs"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={disabled}
              className="h-6 min-w-20 rounded-md bg-primary px-3 text-primary-foreground shadow-xs disabled:bg-muted disabled:text-muted-foreground"
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-start gap-x-2">
      <span className="pt-1 text-right">{label}：</span>
      <div className="min-w-0">
        {children}
        {hint && <div className="mt-0.5 truncate px-1 text-muted-foreground">{hint}</div>}
      </div>
    </div>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 pl-1 text-[11px] font-medium text-muted-foreground">{title}</div>
      <div className="space-y-1.5 rounded-md bg-muted/60 p-2.5">{children}</div>
    </div>
  )
}

const selectClass = "h-6 w-full rounded-md border bg-background px-2"
const inputClass = "h-6 w-full rounded-md border bg-background px-2 outline-none focus:ring-2 focus:ring-ring/50"

export function OperationDialog({
  kind,
  state,
  onClose,
  run,
}: {
  kind: DialogKind
  state: RepoState
  onClose: () => void
  run: RunOperation
}) {
  switch (kind) {
    case "pull":
      return <PullDialog state={state} onClose={onClose} run={run} />
    case "push":
      return <PushDialog state={state} onClose={onClose} run={run} />
    case "fetch":
      return <FetchDialog onClose={onClose} run={run} />
    case "branch":
      return <BranchDialog state={state} onClose={onClose} run={run} />
    case "merge":
      return <MergeDialog state={state} onClose={onClose} run={run} />
    case "stash":
      return <StashDialog state={state} onClose={onClose} run={run} />
  }
}

type Props = { state: RepoState; onClose: () => void; run: RunOperation }

function remoteNames(state: RepoState) {
  return Object.keys(state.remoteBranches)
    .filter((name) => name !== "origin/HEAD")
    .map((name) => name.replace(/^origin\//, ""))
}

function PullDialog({ state, onClose, run }: Props) {
  const names = remoteNames(state)
  const [remoteBranch, setRemoteBranch] = useState(names.includes(state.currentBranch) ? state.currentBranch : "main")
  const [commitMerged, setCommitMerged] = useState(false)
  const [log, setLog] = useState(false)
  const [noFF, setNoFF] = useState(false)
  const [rebase, setRebase] = useState(false)
  const command = `git pull${rebase ? " --rebase" : ""}${noFF ? " --no-ff" : ""}${log ? " --log" : ""}${commitMerged ? "" : " --no-commit"} origin ${remoteBranch}`
  return (
    <Sheet title="拉取" command={command} onClose={onClose} onConfirm={() => run(command)}>
      <Field label="从仓库拉取" hint={state.remoteUrl}>
        <select className={selectClass} defaultValue="origin">
          <option value="origin">origin</option>
        </select>
      </Field>
      <Field label="要拉取的远程分支">
        <div className="flex gap-2">
          <select
            className={selectClass}
            value={remoteBranch}
            onChange={(event) => setRemoteBranch(event.target.value)}
          >
            {names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" className="h-6 shrink-0 rounded-md border bg-background px-3 shadow-xs">
            刷新
          </button>
        </div>
      </Field>
      <Field label="拉取到本地分支">
        <div className="pt-1">{state.currentBranch}</div>
      </Field>
      <Group title="选项">
        <Check label="立即提交合并的改动" checked={commitMerged} onChange={setCommitMerged} />
        <Check label="包括被合并提交的信息内容" checked={log} onChange={setLog} />
        <Check label="无论是否可以快进更新都创建新的提交" checked={noFF} onChange={setNoFF} />
        <Check label="用变基代替合并（警告：请确保您还没有推送您的变更）" checked={rebase} onChange={setRebase} />
      </Group>
    </Sheet>
  )
}

function PushDialog({ state, onClose, run }: Props) {
  const locals = Object.keys(state.branches)
  const [selected, setSelected] = useState<Record<string, boolean>>({ [state.currentBranch]: true })
  const [track, setTrack] = useState<Record<string, boolean>>(
    Object.fromEntries(locals.map((name) => [name, !!state.upstream[name]])),
  )
  const [tags, setTags] = useState(false)
  const chosen = locals.filter((name) => selected[name])
  const allChecked = chosen.length === locals.length
  const command = `git push${chosen.some((name) => track[name] && !state.upstream[name]) ? " -u" : ""} origin ${
    chosen.map((name) => `${name}:${name}`).join(" ") || "<无分支>"
  }${tags ? " --tags" : ""}`
  return (
    <Sheet
      title="推送"
      width={680}
      command={command}
      onClose={onClose}
      disabled={!chosen.length}
      onConfirm={() =>
        run(command, (current) => {
          const remoteBranches = { ...current.remoteBranches }
          const upstream = { ...current.upstream }
          for (const name of chosen) {
            const head = current.branches[name]
            if (head) remoteBranches[`origin/${name}`] = head
            if (track[name]) upstream[name] = `origin/${name}`
          }
          return { ...current, remoteBranches, upstream }
        })
      }
    >
      <div className="flex items-center gap-2">
        <span>推送到仓库：</span>
        <select className="h-6 w-32 rounded-md border bg-background px-2" defaultValue="origin">
          <option value="origin">origin</option>
        </select>
        <span className="truncate text-muted-foreground">{state.remoteUrl}</span>
      </div>
      <Group title="要推送的分支">
        <div className="overflow-hidden rounded border bg-background">
          <div className="grid grid-cols-[3rem_1fr_1fr_3rem] border-b px-2 py-1 text-[11px]">
            <span>推送？</span>
            <span>本地分支</span>
            <span>远程分支</span>
            <span>跟踪？</span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {locals.map((name) => (
              <div key={name} className="grid grid-cols-[3rem_1fr_1fr_3rem] items-center px-2 py-0.5 odd:bg-muted/40">
                <input
                  type="checkbox"
                  aria-label={`推送 ${name}`}
                  checked={!!selected[name]}
                  onChange={(event) => setSelected({ ...selected, [name]: event.target.checked })}
                />
                <span className="truncate pr-2">{name}</span>
                <span className="truncate pr-2">{name}</span>
                <input
                  type="checkbox"
                  aria-label={`跟踪 ${name}`}
                  checked={!!track[name]}
                  onChange={(event) => setTrack({ ...track, [name]: event.target.checked })}
                />
              </div>
            ))}
          </div>
        </div>
        <Check
          label="全选"
          checked={allChecked}
          onChange={(value) => setSelected(Object.fromEntries(locals.map((name) => [name, value])))}
        />
      </Group>
      <Check label="推送所有标签" checked={tags} onChange={setTags} />
    </Sheet>
  )
}

function FetchDialog({ onClose, run }: { onClose: () => void; run: RunOperation }) {
  const [all, setAll] = useState(true)
  const [prune, setPrune] = useState(false)
  const [tags, setTags] = useState(false)
  const command = `git fetch ${all ? "--all" : "origin"}${prune ? " --prune" : ""}${tags ? " --tags" : ""}`
  return (
    <Sheet title="抓取" width={480} command={command} onClose={onClose} onConfirm={() => run(command)}>
      <Check label="抓取所有远端更新" checked={all} onChange={setAll} />
      <Check label="删掉在所有远端都已经不存在的跟踪（tracking）分支" checked={prune} onChange={setPrune} />
      <Check label="抓取并在本地存储所有标签" checked={tags} onChange={setTags} />
    </Sheet>
  )
}

function BranchDialog({ state, onClose, run }: Props) {
  const [tab, setTab] = useState<"new" | "delete">("new")
  const [name, setName] = useState("")
  const [base, setBase] = useState<"parent" | "commit">("parent")
  const [commit, setCommit] = useState("")
  const [checkout, setCheckout] = useState(true)
  const [toDelete, setToDelete] = useState<Record<string, boolean>>({})
  const valid = /^[\w./-]+$/.test(name) && !state.branches[name] && (base === "parent" || commit.length >= 4)
  const deletable = Object.keys(state.branches).filter((branch) => branch !== state.currentBranch)
  const chosen = deletable.filter((branch) => toDelete[branch])
  const startPoint = base === "commit" && commit ? ` ${commit}` : ""
  const command =
    tab === "new"
      ? `${checkout ? "git checkout -b" : "git branch"} ${name || "<新分支>"}${startPoint}`
      : `git branch -d ${chosen.join(" ") || "<分支>"}`
  return (
    <Sheet
      title={tab === "new" ? "新建分支" : "删除分支"}
      showTitle
      width={520}
      command={command}
      onClose={onClose}
      confirmLabel={tab === "new" ? "创建分支" : "删除分支"}
      disabled={tab === "new" ? !valid : !chosen.length}
      header={
        <div className="flex gap-1">
          {(
            [
              ["new", "新建分支", GitBranch],
              ["delete", "删除分支", MinusCircle],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "flex w-16 flex-col items-center gap-0.5 rounded-md py-1 text-[11px]",
                tab === value ? "bg-muted text-primary" : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              <Icon className={cn("size-4", value === "delete" && "text-destructive")} />
              {label}
            </button>
          ))}
        </div>
      }
      onConfirm={() =>
        run(command, (current) => {
          if (tab === "delete") {
            const branches = { ...current.branches }
            for (const branch of chosen) delete branches[branch]
            return { ...current, branches }
          }
          const start =
            base === "commit"
              ? current.commits.find((item) => item.oid.startsWith(commit))?.oid
              : current.branches[current.currentBranch]
          if (!start) return current
          return {
            ...current,
            branches: { ...current.branches, [name]: start },
            currentBranch: checkout ? name : current.currentBranch,
          }
        })
      }
    >
      {tab === "new" ? (
        <>
          <div>
            <div className="mb-1 text-[11px]">当前分支</div>
            <div className="rounded-md bg-muted/60 px-2 py-1.5">{state.currentBranch}</div>
          </div>
          <Field label="新分支" hint={name ? `refs/heads/${name}` : "预览"}>
            <input
              className={inputClass}
              value={name}
              // biome-ignore lint/a11y/noAutofocus: matches Sourcetree's sheet, which focuses the name field
              autoFocus
              onChange={(event) => setName(event.target.value.trim())}
            />
          </Field>
          <Field label="提交">
            <div className="space-y-1 pt-1">
              <label className="flex items-center gap-2">
                <input type="radio" checked={base === "parent"} onChange={() => setBase("parent")} />
                工作副本父节点
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={base === "commit"} onChange={() => setBase("commit")} />
                指定的提交：
              </label>
              <div className="flex gap-2 pl-5">
                <input
                  className="h-6 w-28 rounded-md border bg-background px-2 font-mono disabled:opacity-50"
                  value={commit}
                  disabled={base !== "commit"}
                  onChange={(event) => setCommit(event.target.value.trim())}
                />
                <button type="button" className="h-6 rounded-md border bg-background px-3 shadow-xs">
                  挑选…
                </button>
              </div>
            </div>
          </Field>
          <div className="pl-[8.5rem]">
            <Check label="检出新分支" checked={checkout} onChange={setCheckout} />
          </div>
        </>
      ) : (
        <div className="space-y-1">
          {deletable.length === 0 && <p className="text-muted-foreground">没有可删除的分支</p>}
          {deletable.map((branch) => (
            <Check
              key={branch}
              label={branch}
              checked={!!toDelete[branch]}
              onChange={(value) => setToDelete({ ...toDelete, [branch]: value })}
            />
          ))}
        </div>
      )}
    </Sheet>
  )
}

export function mergeInto(state: RepoState, source: string): RepoState {
  const head = state.branches[state.currentBranch]
  const other = state.branches[source] ?? state.remoteBranches[source]
  if (!head || !other || head === other) return state
  const oid = crypto.randomUUID().replaceAll("-", "").padEnd(40, "0").slice(0, 40)
  return {
    ...state,
    commits: [
      {
        oid,
        parents: [head, other],
        subject: `Merge branch '${source}' into ${state.currentBranch}`,
        author: "Neil",
        email: "neil@example.com",
        date: new Date(),
        files: [],
      },
      ...state.commits,
    ],
    branches: { ...state.branches, [state.currentBranch]: oid },
  }
}

function MergeDialog({ state, onClose, run }: Props) {
  const candidates = [...Object.keys(state.branches), ...Object.keys(state.remoteBranches)].filter(
    (name) => name !== state.currentBranch && name !== "origin/HEAD",
  )
  const [source, setSource] = useState(candidates[0] ?? "")
  const [commit, setCommit] = useState(true)
  const [log, setLog] = useState(false)
  const [noFF, setNoFF] = useState(false)
  const [rebase, setRebase] = useState(false)
  const command = rebase
    ? `git rebase ${source}`
    : `git merge${noFF ? " --no-ff" : ""}${log ? " --log" : ""}${commit ? "" : " --no-commit"} ${source}`
  return (
    <Sheet
      title="合并"
      command={command}
      onClose={onClose}
      disabled={!source}
      onConfirm={() => run(command, (current) => (rebase ? current : mergeInto(current, source)))}
    >
      <Field label="合并来源">
        <select className={selectClass} value={source} onChange={(event) => setSource(event.target.value)}>
          {candidates.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="合并到">
        <div className="pt-1">{state.currentBranch}</div>
      </Field>
      <Group title="选项">
        <Check label="立即提交合并的改动" checked={commit} onChange={setCommit} />
        <Check label="包括被合并提交的信息内容" checked={log} onChange={setLog} />
        <Check label="无论是否可以快进更新都创建新的提交" checked={noFF} onChange={setNoFF} />
        <Check label="用变基代替合并（警告：请确保您还没有推送您的变更）" checked={rebase} onChange={setRebase} />
      </Group>
    </Sheet>
  )
}

function StashDialog({ state, onClose, run }: Props) {
  const [message, setMessage] = useState("")
  const [keepIndex, setKeepIndex] = useState(false)
  const dirty = state.staged.length + state.unstaged.length > 0
  const command = `git stash push${keepIndex ? " --keep-index" : ""}${message ? ` -m "${message}"` : ""}`
  return (
    <Sheet
      title="贮藏"
      width={520}
      command={command}
      onClose={onClose}
      confirmLabel="贮藏"
      disabled={!dirty}
      onConfirm={() =>
        run(command, (current) => {
          const files = keepIndex ? current.unstaged : [...current.staged, ...current.unstaged]
          const stashes = current.stashes.map((stash, index) => ({ ...stash, name: `stash@{${index + 1}}` }))
          return {
            ...current,
            stashes: [
              { name: "stash@{0}", message: `On ${current.currentBranch}: ${message || "未命名贮藏"}`, files },
              ...stashes,
            ],
            staged: keepIndex ? current.staged : [],
            unstaged: [],
          }
        })
      }
    >
      <p>这样将贮藏所有的变更到你的工作区并且返回到一个干净的工作区状态。</p>
      {!dirty && <p className="text-muted-foreground">工作区没有可贮藏的更改。</p>}
      <Field label="信息">
        <input
          className={inputClass}
          placeholder="可选"
          value={message}
          // biome-ignore lint/a11y/noAutofocus: matches Sourcetree's sheet, which focuses the message field
          autoFocus
          onChange={(event) => setMessage(event.target.value)}
        />
      </Field>
      <div className="pl-[8.5rem]">
        <Check label="保留缓存的变更" checked={keepIndex} onChange={setKeepIndex} />
      </div>
    </Sheet>
  )
}
