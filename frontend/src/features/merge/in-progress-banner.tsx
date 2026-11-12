// The banner under the title bar while the repository is in the middle of a
// merge, rebase, cherry-pick or revert, with 中止合并 / 中止变基.
import { TriangleAlert } from "lucide-react"
import { useState } from "react"
import { useWritesBlocked } from "@/features/jobs/write-block"
import { OperationErrorNotice } from "@/features/operations/operation-error-view"
import { OperationSheet } from "@/features/operations/operation-sheet"
import type { RepoSummary } from "@/lib/api/repos"
import { useOperation } from "@/lib/api/use-operation"
import { abortMergeCommand, abortRebaseCommand } from "@/lib/command-preview"
import { type InProgressNotice, inProgressNotice } from "./in-progress"

const ABORT = {
  abortMerge: { label: "中止合并", command: abortMergeCommand, what: "合并" },
  abortRebase: { label: "中止变基", command: abortRebaseCommand, what: "变基" },
} as const

export function InProgressBanner({ summary, conflictedCount }: { summary: RepoSummary; conflictedCount: number }) {
  const [confirming, setConfirming] = useState(false)
  const notice = inProgressNotice(summary.state, conflictedCount)
  if (!notice) return null
  const abort = notice.abort && ABORT[notice.abort]
  return (
    <div
      role="status"
      aria-label={`仓库${notice.title}`}
      className="flex shrink-0 items-center gap-2 border-b bg-warning/20 px-4 py-1.5"
    >
      <TriangleAlert className="size-4 shrink-0 text-warning" />
      <span className="font-semibold">{notice.title}</span>
      <span className="min-w-0 flex-1 truncate" title={notice.detail}>
        {notice.detail}
      </span>
      {abort && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-6 shrink-0 rounded-md border bg-background px-3 shadow-xs hover:bg-accent"
        >
          {abort.label}
        </button>
      )}
      {confirming && notice.abort && (
        <AbortSheet repoId={summary.id} op={notice.abort} onClose={() => setConfirming(false)} />
      )}
    </div>
  )
}

/** Confirms abandoning the merge or rebase: conflict resolutions made so far are lost. */
function AbortSheet({
  repoId,
  op,
  onClose,
}: {
  repoId: string
  op: NonNullable<InProgressNotice["abort"]>
  onClose: () => void
}) {
  const operation = useOperation(repoId, op)
  const blocked = useWritesBlocked(repoId)
  const { label, command, what } = ABORT[op]
  return (
    <OperationSheet
      title={label}
      showTitle
      width={480}
      command={command()}
      confirmLabel={label}
      disabled={operation.isPending}
      blockedBy={blocked}
      onClose={onClose}
      onConfirm={() => !operation.isPending && operation.mutate({}, { onSuccess: onClose })}
    >
      <p>确定要中止当前的{what}吗？</p>
      <p className="text-destructive">
        分支、暂存区和工作区将恢复到{what}开始之前的状态，已解决的冲突和{what}产生的改动都会丢失。
      </p>
      {operation.error && <OperationErrorNotice error={operation.error} onDismiss={() => operation.reset()} />}
    </OperationSheet>
  )
}
