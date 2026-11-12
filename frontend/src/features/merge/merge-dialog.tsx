// The 合并 sheet (title bar) and the confirmation of 将当前变更变基到 X
// (branch context menu). A merge or rebase that stops on conflicts closes
// the sheet and calls onConflict: the workbench then shows the in-progress
// banner and the conflicted files.
import { useState } from "react"
import { useWritesBlocked } from "@/features/jobs/write-block"
import { isConflict } from "@/features/operations/operation-error"
import { OperationErrorNotice } from "@/features/operations/operation-error-view"
import { Check, Field, Group, OperationSheet, selectClass } from "@/features/operations/operation-sheet"
import type { Refs } from "@/lib/api/history"
import type { MergeRequest } from "@/lib/api/operations"
import type { RepoSummary } from "@/lib/api/repos"
import { useOperation } from "@/lib/api/use-operation"
import { mergeCommand, placeholder, rebaseCommand } from "@/lib/command-preview"
import { inProgressNotice } from "./in-progress"
import { mergeSources } from "./merge-sources"

export function MergeDialog({
  summary,
  refs,
  onClose,
  onConflict,
}: {
  summary: RepoSummary
  refs?: Refs
  onClose: () => void
  onConflict: () => void
}) {
  const merge = useOperation(summary.id, "merge")
  const rebase = useOperation(summary.id, "rebase")
  const sources = mergeSources(refs)
  const [source, setSource] = useState<string>()
  const [commit, setCommit] = useState(true)
  const [log, setLog] = useState(false)
  const [noFastForward, setNoFastForward] = useState(false)
  const [useRebase, setUseRebase] = useState(false)

  const branch = source ?? sources[0] ?? ""
  const request: MergeRequest = { branch, noFastForward, log, noCommit: !commit }
  const busy = merge.isPending || rebase.isPending
  const error = merge.error ?? rebase.error
  // A merge needs a branch to merge into; a rebase can also move a detached HEAD.
  const blocked = inProgressNotice(summary.state, 0)
  const jobBlocked = useWritesBlocked(summary.id)
  const canSubmit = !!branch && !busy && !blocked && !jobBlocked && (useRebase || !summary.detached)
  const handlers = {
    onSuccess: onClose,
    onError: (failure: Error) => {
      if (!isConflict(failure)) return
      onClose()
      onConflict()
    },
  }
  const submit = () => {
    if (!canSubmit) return
    merge.reset()
    rebase.reset()
    if (useRebase) rebase.mutate({ onto: branch }, handlers)
    else merge.mutate(request, handlers)
  }

  return (
    <OperationSheet
      title="合并"
      command={
        useRebase
          ? rebaseCommand({ onto: branch || placeholder("分支") })
          : mergeCommand({ ...request, branch: branch || placeholder("分支") })
      }
      onClose={onClose}
      onConfirm={submit}
      disabled={!canSubmit}
      blockedBy={jobBlocked}
    >
      <Field label="合并来源">
        <select
          className={selectClass}
          aria-label="合并来源"
          value={branch}
          disabled={!sources.length}
          onChange={(event) => setSource(event.target.value)}
        >
          {sources.length ? (
            sources.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))
          ) : (
            <option value="">没有可合并的分支</option>
          )}
        </select>
      </Field>
      <Field label="合并到">
        <div className="pt-1">{summary.detached ? `HEAD（分离于 ${summary.head.slice(0, 7)}）` : summary.branch}</div>
      </Field>
      <Group title="选项">
        <Check label="立即提交合并的改动" checked={commit} onChange={setCommit} disabled={useRebase} />
        <Check label="包括被合并提交的信息内容" checked={log} onChange={setLog} disabled={useRebase} />
        <Check
          label="无论是否可以快进更新都创建新的提交"
          checked={noFastForward}
          onChange={setNoFastForward}
          disabled={useRebase}
        />
        <Check label="用变基代替合并（警告：请确保您还没有推送您的变更）" checked={useRebase} onChange={setUseRebase} />
      </Group>
      {blocked && (
        <p role="status" className="text-destructive">
          仓库当前处于“{blocked.title}”状态，请先完成或中止它。
        </p>
      )}
      {!blocked && summary.detached && !useRebase && (
        <p role="status" className="text-muted-foreground">
          HEAD 处于分离状态，请先检出一个分支再合并。
        </p>
      )}
      {error && !isConflict(error) && (
        <OperationErrorNotice
          error={error}
          onDismiss={() => {
            merge.reset()
            rebase.reset()
          }}
        />
      )}
    </OperationSheet>
  )
}

/** Confirms 将当前变更变基到 X: the current branch's commits are rewritten. */
export function RebaseSheet({
  summary,
  onto,
  onClose,
  onConflict,
}: {
  summary: RepoSummary
  onto: string
  onClose: () => void
  onConflict: () => void
}) {
  const rebase = useOperation(summary.id, "rebase")
  const current = summary.detached ? "HEAD" : summary.branch
  const blocked = useWritesBlocked(summary.id)
  const submit = () => {
    if (rebase.isPending || blocked) return
    rebase.mutate(
      { onto },
      {
        onSuccess: onClose,
        onError: (failure) => {
          if (!isConflict(failure)) return
          onClose()
          onConflict()
        },
      },
    )
  }
  return (
    <OperationSheet
      title="确认变基"
      showTitle
      width={480}
      command={rebaseCommand({ onto })}
      confirmLabel="变基"
      onClose={onClose}
      onConfirm={submit}
      disabled={rebase.isPending}
      blockedBy={blocked}
    >
      <p className="break-words">
        确定要将 <span className="font-medium">{current}</span> 上的变更变基到{" "}
        <span className="font-medium">{onto}</span> 吗？
      </p>
      <p className="text-muted-foreground">变基会重写这些提交。请确保您还没有推送它们。</p>
      {rebase.error && !isConflict(rebase.error) && (
        <OperationErrorNotice error={rebase.error} onDismiss={() => rebase.reset()} />
      )}
    </OperationSheet>
  )
}
