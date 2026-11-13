// Commit operations for the history view: the actions behind a commit's
// context menu, plus the sheets they open.
//
// The workbench calls useCommitOperations once, renders `dialogs`, and hands
// `actions` to the history view.
import { type ReactNode, useState } from "react"
import { BranchDialog } from "@/features/branches/branch-dialog"
import { useCopyText } from "@/features/clipboard/copy-text"
import { useWritesBlocked } from "@/features/jobs/write-block"
import { inProgressNotice } from "@/features/merge/in-progress"
import { commitLabel, MergeDialog, RebaseSheet } from "@/features/merge/merge-dialog"
import type { GraphCommit, Refs } from "@/lib/api/history"
import type { RepoSummary } from "@/lib/api/repos"
import { CheckoutCommitSheet, CherryPickSheet, CreateTagSheet, ResetSheet, RevertSheet } from "./commit-sheets"

/** What the commit context menu can do with a commit; each opens a sheet unless noted. */
export type CommitActions = {
  /** 检出…: with HEAD detached. */
  checkout: (commit: GraphCommit) => void
  /** 合并至当前分支: the 合并 sheet with this commit chosen. */
  merge: (commit: GraphCommit) => void
  /** 变基当前分支到此提交… */
  rebase: (commit: GraphCommit) => void
  /** 新建分支…: the 分支 sheet starting at this commit. */
  createBranch: (commit: GraphCommit) => void
  /** 新建标签… */
  createTag: (commit: GraphCommit) => void
  /** 重置当前分支到此提交… */
  reset: (commit: GraphCommit) => void
  /** 反转提交… */
  revert: (commit: GraphCommit) => void
  /** 遴选 */
  cherryPick: (commit: GraphCommit) => void
  /** 复制 SHA 到剪贴板: right away, confirming it or showing the SHA when the clipboard refuses. */
  copySha: (commit: GraphCommit) => void
  /**
   * Why the items that change the repository are unavailable: it is in the
   * middle of a merge, rebase, cherry-pick or revert. The menu shows them
   * disabled with this explanation.
   */
  inProgress?: string
  /** Why writes would wait for a background job now; the sheets say so and wait. */
  writesBlocked?: string
}

type Sheet = "checkout" | "merge" | "rebase" | "createBranch" | "createTag" | "reset" | "revert" | "cherryPick"

/** `onConflict` runs when a revert or cherry-pick stops on conflicts. */
export function useCommitOperations(
  summary: RepoSummary | undefined,
  refs: Refs | undefined,
  { onConflict }: { onConflict: () => void },
): { actions?: CommitActions; dialogs: ReactNode } {
  const [open, setOpen] = useState<{ sheet: Sheet; commit: GraphCommit }>()
  const copyText = useCopyText()
  const writesBlocked = useWritesBlocked(summary?.id ?? "")
  const notice = summary && inProgressNotice(summary.state, 0)
  const opener = (sheet: Sheet) => (commit: GraphCommit) => setOpen({ sheet, commit })

  const actions: CommitActions | undefined = summary && {
    checkout: opener("checkout"),
    merge: opener("merge"),
    rebase: opener("rebase"),
    createBranch: opener("createBranch"),
    createTag: opener("createTag"),
    reset: opener("reset"),
    revert: opener("revert"),
    cherryPick: opener("cherryPick"),
    copySha: (commit) => copyText.copy(commit.oid, " SHA"),
    inProgress: notice ? `仓库当前处于“${notice.title}”状态，请先完成或中止它。` : undefined,
    writesBlocked,
  }

  const close = () => setOpen(undefined)
  let sheet: ReactNode = null
  if (summary && open) {
    const props = { summary, commit: open.commit, onClose: close }
    switch (open.sheet) {
      case "checkout":
        sheet = <CheckoutCommitSheet {...props} />
        break
      case "merge":
        sheet = (
          <MergeDialog summary={summary} refs={refs} commit={open.commit} onClose={close} onConflict={onConflict} />
        )
        break
      case "rebase":
        sheet = (
          <RebaseSheet
            summary={summary}
            onto={open.commit.oid}
            ontoLabel={commitLabel(open.commit)}
            onClose={close}
            onConflict={onConflict}
          />
        )
        break
      case "createBranch":
        sheet = (
          <BranchDialog
            summary={summary}
            branches={refs?.branches ?? []}
            initialTab="new"
            initialStartPoint={open.commit.oid}
            onClose={close}
          />
        )
        break
      case "createTag":
        sheet = <CreateTagSheet {...props} tags={refs?.tags.map((tag) => tag.name) ?? []} />
        break
      case "reset":
        sheet = <ResetSheet {...props} />
        break
      case "revert":
        sheet = <RevertSheet {...props} onConflict={onConflict} />
        break
      case "cherryPick":
        sheet = <CherryPickSheet {...props} onConflict={onConflict} />
        break
    }
  }
  return {
    actions,
    dialogs: (
      <>
        {sheet}
        {copyText.feedback}
      </>
    ),
  }
}
