// The 分支 sheet from the title bar: 新建分支 and 删除分支 tabs.
import { GitBranch, MinusCircle, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { useWritesBlocked } from "@/features/jobs/write-block"
import { OperationErrorNotice } from "@/features/operations/operation-error-view"
import { Check, Field, inputClass, OperationSheet } from "@/features/operations/operation-sheet"
import { ApiError } from "@/lib/api/client"
import type { Branch } from "@/lib/api/history"
import type { CreateBranchRequest, DeleteBranchesRequest } from "@/lib/api/operations"
import type { RepoSummary } from "@/lib/api/repos"
import { useOperation } from "@/lib/api/use-operation"
import { createBranchCommand, deleteBranchesCommand, placeholder } from "@/lib/command-preview"
import { cn } from "@/lib/utils"
import { branchNameProblem } from "./branch-name"
import { unmergedBranches } from "./unmerged"

export type BranchDialogTab = "new" | "delete"

export function BranchDialog({
  summary,
  branches,
  initialTab = "new",
  initialSelection = [],
  onClose,
}: {
  summary: RepoSummary
  /** Local branches. */
  branches: Branch[]
  initialTab?: BranchDialogTab
  /** Branches ticked on the 删除分支 tab when it opens. */
  initialSelection?: string[]
  onClose: () => void
}) {
  const [tab, setTab] = useState(initialTab)
  const create = useCreateBranchForm(summary.id, branches, onClose)
  const remove = useDeleteBranchesForm(summary.id, branches, initialSelection, onClose)
  const form = tab === "new" ? create : remove

  return (
    <OperationSheet
      title={tab === "new" ? "新建分支" : "删除分支"}
      showTitle
      width={520}
      command={form.command}
      onClose={onClose}
      confirmLabel={form.confirmLabel}
      destructive={tab === "delete"}
      disabled={!form.canSubmit}
      pending={form.operation.isPending}
      blockedBy={form.blocked}
      onConfirm={form.submit}
      header={
        <div className="flex gap-1" role="tablist">
          {(
            [
              ["new", "新建分支", GitBranch],
              ["delete", "删除分支", MinusCircle],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
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
    >
      {tab === "new" ? <CreateBranchFields summary={summary} form={create} /> : <DeleteBranchesFields form={remove} />}
    </OperationSheet>
  )
}

function useCreateBranchForm(repoId: string, branches: Branch[], onDone: () => void) {
  const operation = useOperation(repoId, "createBranch")
  const [name, setName] = useState("")
  const [base, setBase] = useState<"parent" | "commit">("parent")
  const [commit, setCommit] = useState("")
  const [checkout, setCheckout] = useState(true)
  const problem = branchNameProblem(
    name,
    branches.map((branch) => branch.name),
  )
  const request: CreateBranchRequest = {
    name,
    startPoint: base === "commit" ? commit.trim() : undefined,
    checkout,
  }
  const blocked = useWritesBlocked(repoId)
  const canSubmit = !problem && (base === "parent" || !!request.startPoint) && !operation.isPending && !blocked
  return {
    name,
    setName,
    base,
    setBase,
    commit,
    setCommit,
    checkout,
    setCheckout,
    problem,
    operation,
    command: createBranchCommand({ ...request, name: name || placeholder("新分支") }),
    confirmLabel: "创建分支",
    canSubmit,
    blocked,
    submit: () => canSubmit && operation.mutate(request, { onSuccess: onDone }),
  }
}

function CreateBranchFields({ summary, form }: { summary: RepoSummary; form: ReturnType<typeof useCreateBranchForm> }) {
  const current = summary.detached ? `HEAD（分离于 ${summary.head.slice(0, 7)}）` : summary.branch
  const showProblem = form.name !== "" && form.problem
  return (
    <>
      <div>
        <div className="mb-1 text-[11px]">当前分支</div>
        <div className="rounded-md bg-muted/60 px-2 py-1.5">{current}</div>
      </div>
      <Field label="新分支" hint={showProblem ? undefined : form.name ? `refs/heads/${form.name}` : "预览"}>
        <input
          className={inputClass}
          value={form.name}
          aria-label="新分支名"
          aria-invalid={!!showProblem}
          // biome-ignore lint/a11y/noAutofocus: matches Sourcetree's sheet, which focuses the name field
          autoFocus
          onChange={(event) => form.setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && form.submit()}
        />
        {showProblem && <div className="mt-0.5 px-1 text-destructive">{form.problem}</div>}
      </Field>
      <Field label="提交">
        <div className="space-y-1 pt-1">
          <label className="flex items-center gap-2">
            <input type="radio" checked={form.base === "parent"} onChange={() => form.setBase("parent")} />
            工作副本父节点
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={form.base === "commit"} onChange={() => form.setBase("commit")} />
            指定的提交：
          </label>
          <div className="flex gap-2 pl-5">
            <input
              className="h-6 w-28 rounded-md border bg-background px-2 font-mono disabled:opacity-50"
              value={form.commit}
              aria-label="指定的提交"
              disabled={form.base !== "commit"}
              onChange={(event) => form.setCommit(event.target.value)}
            />
            <button
              type="button"
              disabled
              title="尚未提供：请输入提交号或分支名"
              className="h-6 rounded-md border bg-background px-3 shadow-xs disabled:opacity-50"
            >
              挑选…
            </button>
          </div>
        </div>
      </Field>
      <div className="pl-[8.5rem]">
        <Check label="检出新分支" checked={form.checkout} onChange={form.setCheckout} />
      </div>
      {form.operation.error && (
        <OperationErrorNotice error={form.operation.error} onDismiss={() => form.operation.reset()} />
      )}
    </>
  )
}

function useDeleteBranchesForm(repoId: string, branches: Branch[], initialSelection: string[], onDone: () => void) {
  const operation = useOperation(repoId, "deleteBranches")
  const [selected, setSelected] = useState(() => new Set(initialSelection))
  /** Branches git refused to delete because they are not merged; confirming now forces them. */
  const [unmerged, setUnmerged] = useState<string[]>([])
  /** Whether git deleted the other chosen branches when it refused the unmerged ones. */
  const [othersDeleted, setOthersDeleted] = useState(false)
  const deletable = branches.filter((branch) => !branch.current).map((branch) => branch.name)
  const chosen = deletable.filter((name) => selected.has(name))
  const force = unmerged.length > 0
  const request: DeleteBranchesRequest = force ? { branches: unmerged, force } : { branches: chosen }
  const blocked = useWritesBlocked(repoId)
  const canSubmit = request.branches.length > 0 && !operation.isPending && !blocked
  const toggle = (name: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(name)
    else next.delete(name)
    setSelected(next)
    setUnmerged([])
    operation.reset()
  }
  return {
    deletable,
    selected,
    toggle,
    unmerged,
    othersDeleted,
    operation,
    command: deleteBranchesCommand(request.branches.length ? request : { ...request, branches: [placeholder("分支")] }),
    confirmLabel: force ? "强制删除" : "删除分支",
    canSubmit,
    blocked,
    submit: () => {
      if (!canSubmit) return
      operation.mutate(request, {
        onSuccess: onDone,
        onError: (error) => {
          if (!(error instanceof ApiError) || error.code !== "branch_not_merged") return
          const refused = unmergedBranches(error.output ?? "", request.branches)
          if (refused.length === 0) return
          setSelected(new Set(refused))
          setUnmerged(refused)
          setOthersDeleted(refused.length < request.branches.length)
          operation.reset()
        },
      })
    },
  }
}

function DeleteBranchesFields({ form }: { form: ReturnType<typeof useDeleteBranchesForm> }) {
  return (
    <>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {form.deletable.length === 0 && <p className="text-muted-foreground">没有可删除的分支</p>}
        {form.deletable.map((name) => (
          <Check
            key={name}
            label={name}
            checked={form.selected.has(name)}
            onChange={(value) => form.toggle(name, value)}
          />
        ))}
      </div>
      {form.unmerged.length > 0 && (
        <div role="alert" className="flex gap-2 rounded-md border border-warning/60 bg-warning/10 px-2 py-1.5">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <div>
            <div className="font-medium">以下分支尚未完全合并：{form.unmerged.join("、")}</div>
            <div>
              强制删除会丢失只在这些分支上的提交。
              {form.othersDeleted && "其余选中的分支已删除。"}
            </div>
          </div>
        </div>
      )}
      {form.operation.error && (
        <OperationErrorNotice error={form.operation.error} onDismiss={() => form.operation.reset()} />
      )}
    </>
  )
}
