// Branch operations for the workbench: the actions behind the sidebar's
// branch rows and context menu and the title bar's 分支 button, plus the
// dialogs they open.
//
// The workbench calls useBranchOperations once, renders `dialogs`, and
// provides `actions` through BranchActionsContext; sidebar rows read them
// with useBranchActions().
import { createContext, type ReactNode, useContext, useState } from "react"
import { OperationErrorDialog } from "@/features/operations/operation-error-view"
import type { Refs } from "@/lib/api/history"
import type { RepoSummary } from "@/lib/api/repos"
import { useOperation } from "@/lib/api/use-operation"
import { BranchDialog, type BranchDialogTab } from "./branch-dialog"
import { RenameBranchDialog } from "./rename-branch-dialog"

/**
 * What can be done to a local branch. The optional actions belong to later
 * features (merge and rebase: ticket 11; 拿来 and push: ticket 10; compare);
 * until they are set, the context menu shows their items disabled.
 */
export type BranchActions = {
  checkout: (branch: string) => void
  /** Opens the 分支 sheet: 新建分支, or 删除分支 with `branches` ticked. */
  openBranchDialog: (options?: { tab?: BranchDialogTab; branches?: string[] }) => void
  rename: (branch: string) => void
  /** Asks before deleting, offering to force when the branch is not merged. */
  delete: (branch: string) => void
  setUpstream: (branch: string, upstream: string) => void
  /** 合并 X 至当前分支. */
  merge?: (branch: string) => void
  /** 将当前变更变基到 X. */
  rebase?: (branch: string) => void
  /** 拿来 X: fast-forward X from its upstream without checking it out. */
  fetchInto?: (branch: string) => void
  /** 推送到 <upstream>（已跟踪）. */
  pushToUpstream?: (branch: string) => void
  /** 推送到 ▸ <remote>. */
  pushTo?: (branch: string, remote: string) => void
  /** 与当前对比. */
  compare?: (branch: string) => void
}

export const BranchActionsContext = createContext<BranchActions | undefined>(undefined)

/** Branch actions of the open repository; undefined while it loads. */
export function useBranchActions(): BranchActions | undefined {
  return useContext(BranchActionsContext)
}

type OpenDialog =
  | { kind: "branch"; tab: BranchDialogTab; branches: string[] }
  | { kind: "rename"; branch: string }
  | { kind: "failure"; title: string; error: Error }

export function useBranchOperations(
  summary: RepoSummary | undefined,
  refs: Refs | undefined,
): { actions?: BranchActions; dialogs: ReactNode } {
  const repoId = summary?.id ?? ""
  const checkout = useOperation(repoId, "checkout")
  const setUpstream = useOperation(repoId, "set-upstream")
  const [dialog, setDialog] = useState<OpenDialog>()
  const close = () => setDialog(undefined)
  const fail = (title: string) => (error: Error) => setDialog({ kind: "failure", title, error })

  const actions: BranchActions | undefined = summary && {
    checkout: (branch) => {
      if (!checkout.isPending) checkout.mutate({ branch }, { onError: fail(`无法检出 ${branch}`) })
    },
    openBranchDialog: (options) =>
      setDialog({ kind: "branch", tab: options?.tab ?? "new", branches: options?.branches ?? [] }),
    rename: (branch) => setDialog({ kind: "rename", branch }),
    delete: (branch) => setDialog({ kind: "branch", tab: "delete", branches: [branch] }),
    setUpstream: (branch, upstream) =>
      setUpstream.mutate({ branch, upstream }, { onError: fail(`无法让 ${branch} 跟踪 ${upstream}`) }),
  }

  const branches = refs?.branches ?? []
  let dialogs: ReactNode = null
  if (summary && dialog?.kind === "branch") {
    dialogs = (
      <BranchDialog
        summary={summary}
        branches={branches}
        initialTab={dialog.tab}
        initialSelection={dialog.branches}
        onClose={close}
      />
    )
  } else if (summary && dialog?.kind === "rename") {
    dialogs = (
      <RenameBranchDialog
        repoId={summary.id}
        branch={dialog.branch}
        branchNames={branches.map((branch) => branch.name)}
        onClose={close}
      />
    )
  } else if (dialog?.kind === "failure") {
    dialogs = <OperationErrorDialog title={dialog.title} error={dialog.error} onClose={close} />
  }
  return { actions, dialogs }
}
