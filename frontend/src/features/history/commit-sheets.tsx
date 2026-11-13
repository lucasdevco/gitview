// The confirmation sheets of the commit context menu: 检出 (detached), 新建标签,
// 重置当前分支到此提交, 反转提交 and 遴选. A revert or cherry-pick that stops on
// conflicts closes its sheet and calls onConflict: the workbench then shows
// the in-progress banner and the conflicted files.
import { TriangleAlert } from "lucide-react"
import { type ReactNode, useState } from "react"
import { useWritesBlocked } from "@/features/jobs/write-block"
import { inProgressNotice } from "@/features/merge/in-progress"
import { isConflict } from "@/features/operations/operation-error"
import { OperationErrorNotice } from "@/features/operations/operation-error-view"
import { Field, inputClass, OperationSheet } from "@/features/operations/operation-sheet"
import type { GraphCommit } from "@/lib/api/history"
import type { ResetMode } from "@/lib/api/operations"
import type { RepoSummary } from "@/lib/api/repos"
import { useOperation } from "@/lib/api/use-operation"
import {
  checkoutCommand,
  cherryPickCommand,
  createTagCommand,
  placeholder,
  resetCommand,
  revertCommand,
} from "@/lib/command-preview"
import { tagNameProblem } from "./tag-name"

type SheetProps = { summary: RepoSummary; commit: GraphCommit; onClose: () => void }

/** The commit a sheet acts on: short oid and subject. */
function CommitName({ commit }: { commit: GraphCommit }) {
  return (
    <span className="font-medium break-words">
      <span className="font-mono">{commit.oid.slice(0, 7)}</span> {commit.subject}
    </span>
  )
}

/** The checked-out branch, or HEAD when detached. */
const currentName = (summary: RepoSummary) => (summary.detached ? "HEAD" : summary.branch)

/**
 * Why the sheet cannot run now: the repository is in the middle of another
 * operation, or a background job holds the write lock.
 */
function useBlocked(summary: RepoSummary): string | undefined {
  const jobBlocked = useWritesBlocked(summary.id)
  const notice = inProgressNotice(summary.state, 0)
  return notice ? `仓库当前处于“${notice.title}”状态，请先完成或中止它。` : jobBlocked
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex gap-2 rounded-md border border-warning/60 bg-warning/10 px-2 py-1.5">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <div>{children}</div>
    </div>
  )
}

/** 检出…: checks the commit out with HEAD detached. */
export function CheckoutCommitSheet({ summary, commit, onClose }: SheetProps) {
  const checkout = useOperation(summary.id, "checkout")
  const blocked = useBlocked(summary)
  const request = { commit: commit.oid }
  return (
    <OperationSheet
      title="检出提交"
      showTitle
      width={500}
      command={checkoutCommand(request)}
      confirmLabel="检出"
      pending={checkout.isPending}
      blockedBy={blocked}
      onClose={onClose}
      onConfirm={() => !checkout.isPending && !blocked && checkout.mutate(request, { onSuccess: onClose })}
    >
      <p>
        确定要检出提交 <CommitName commit={commit} /> 吗？
      </p>
      <Warning>
        <div className="font-medium">仓库将处于“分离 HEAD”状态</div>
        <div>
          HEAD
          将直接指向此提交，而不在任何分支上。在此状态下新建的提交不属于任何分支，检出其他分支后可能难以找回；如需在此提交上继续工作，请新建分支。
        </div>
      </Warning>
      {checkout.error && <OperationErrorNotice error={checkout.error} onDismiss={() => checkout.reset()} />}
    </OperationSheet>
  )
}

/** 新建标签…: a lightweight tag, or an annotated one when there is a message. */
export function CreateTagSheet({ summary, commit, tags, onClose }: SheetProps & { tags: readonly string[] }) {
  const createTag = useOperation(summary.id, "createTag")
  const blocked = useBlocked(summary)
  const [name, setName] = useState("")
  const [message, setMessage] = useState("")
  const problem = tagNameProblem(name, tags)
  const request = { name, commit: commit.oid, message: message.trim() || undefined }
  const canSubmit = !problem && !createTag.isPending && !blocked
  const submit = () => canSubmit && createTag.mutate(request, { onSuccess: onClose })
  const showProblem = name !== "" && problem
  return (
    <OperationSheet
      title="新建标签"
      showTitle
      width={520}
      command={createTagCommand({ ...request, name: name || placeholder("标签") })}
      confirmLabel="创建标签"
      disabled={!canSubmit}
      pending={createTag.isPending}
      blockedBy={blocked}
      onClose={onClose}
      onConfirm={submit}
    >
      <Field label="标签名称" hint={showProblem ? undefined : name ? `refs/tags/${name}` : "预览"}>
        <input
          className={inputClass}
          value={name}
          aria-label="标签名称"
          aria-invalid={!!showProblem}
          // biome-ignore lint/a11y/noAutofocus: like Sourcetree's sheet, typing the name comes first
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && submit()}
        />
        {showProblem && <div className="mt-0.5 px-1 text-destructive">{problem}</div>}
      </Field>
      <Field label="提交">
        <div className="pt-1">
          <CommitName commit={commit} />
        </div>
      </Field>
      <Field label="消息" hint="可选。填写消息时创建附注标签，否则创建轻量标签。">
        <textarea
          className="min-h-14 w-full resize-y rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-ring/50"
          value={message}
          aria-label="标签消息"
          onChange={(event) => setMessage(event.target.value)}
        />
      </Field>
      {createTag.error && <OperationErrorNotice error={createTag.error} onDismiss={() => createTag.reset()} />}
    </OperationSheet>
  )
}

/** The reset modes in Sourcetree's order and wording. */
const RESET_MODES: { mode: ResetMode; label: string }[] = [
  { mode: "soft", label: "软合并 - 保持所有本地改动" },
  { mode: "mixed", label: "混合合并 - 保持工作副本，但重置索引" },
  { mode: "hard", label: "强行合并 - 丢弃所有工作副本改动" },
]

/** 重置当前分支到此提交…: soft, mixed (default) or hard. */
export function ResetSheet({ summary, commit, onClose }: SheetProps) {
  const reset = useOperation(summary.id, "reset")
  const blocked = useBlocked(summary)
  const [mode, setMode] = useState<ResetMode>("mixed")
  const request = { commit: commit.oid, mode }
  const hard = mode === "hard"
  return (
    <OperationSheet
      title="重置当前分支到此提交"
      showTitle
      width={520}
      command={resetCommand(request)}
      confirmLabel={hard ? "强行重置" : "重置"}
      destructive={hard}
      pending={reset.isPending}
      blockedBy={blocked}
      onClose={onClose}
      onConfirm={() => !reset.isPending && !blocked && reset.mutate(request, { onSuccess: onClose })}
    >
      <p>
        将 <span className="font-medium">{currentName(summary)}</span> 重置到提交 <CommitName commit={commit} />。
      </p>
      <Field label="使用模式">
        <div className="space-y-1 pt-1" role="radiogroup" aria-label="使用模式">
          {RESET_MODES.map((option) => (
            <label key={option.mode} className="flex items-center gap-2">
              <input type="radio" checked={mode === option.mode} onChange={() => setMode(option.mode)} />
              {option.label}
            </label>
          ))}
        </div>
      </Field>
      {hard ? (
        <p role="alert" className="text-destructive">
          警告：强行合并会丢弃所有未提交的改动（已暂存和未暂存的），且无法恢复。未跟踪的文件不受影响。
        </p>
      ) : (
        <p className="text-muted-foreground">
          {mode === "soft" ? "此提交之后的改动将保留为已暂存的改动。" : "此提交之后的改动将保留在工作副本中，未暂存。"}
        </p>
      )}
      {reset.error && <OperationErrorNotice error={reset.error} onDismiss={() => reset.reset()} />}
    </OperationSheet>
  )
}

type ApplyProps = SheetProps & { onConflict: () => void }

/** Closes the sheet on success; on conflicts closes it and shows the in-progress state. */
const settle = (onClose: () => void, onConflict: () => void) => ({
  onSuccess: onClose,
  onError: (failure: Error) => {
    if (!isConflict(failure)) return
    onClose()
    onConflict()
  },
})

/** 反转提交…: a new commit undoing this one. */
export function RevertSheet({ summary, commit, onClose, onConflict }: ApplyProps) {
  const revert = useOperation(summary.id, "revert")
  const blocked = useBlocked(summary)
  const merge = commit.parents.length > 1
  const request = { commit: commit.oid }
  return (
    <OperationSheet
      title="确认反转"
      showTitle
      width={500}
      command={revertCommand(request, { merge })}
      confirmLabel="反转"
      pending={revert.isPending}
      blockedBy={blocked}
      onClose={onClose}
      onConfirm={() => !revert.isPending && !blocked && revert.mutate(request, settle(onClose, onConflict))}
    >
      <p>
        确定要反转提交 <CommitName commit={commit} /> 吗？
      </p>
      <p className="text-muted-foreground">
        将在 {currentName(summary)} 上新建一个提交来撤销它的改动。如有冲突，解决后提交即可完成反转。
      </p>
      {merge && (
        <Warning>
          这是一个合并提交：将相对于它的第一个父提交 <span className="font-mono">{commit.parents[0]?.slice(0, 7)}</span>{" "}
          反转（-m 1），即撤销被合并进来的改动。
        </Warning>
      )}
      {revert.error && !isConflict(revert.error) && (
        <OperationErrorNotice error={revert.error} onDismiss={() => revert.reset()} />
      )}
    </OperationSheet>
  )
}

/** 遴选: copies this commit's changes onto the current branch as a new commit. */
export function CherryPickSheet({ summary, commit, onClose, onConflict }: ApplyProps) {
  const cherryPick = useOperation(summary.id, "cherryPick")
  const blocked = useBlocked(summary)
  const merge = commit.parents.length > 1
  const request = { commit: commit.oid }
  return (
    <OperationSheet
      title="确认遴选"
      showTitle
      width={500}
      command={cherryPickCommand(request, { merge })}
      confirmLabel="遴选"
      pending={cherryPick.isPending}
      blockedBy={blocked}
      onClose={onClose}
      onConfirm={() => !cherryPick.isPending && !blocked && cherryPick.mutate(request, settle(onClose, onConflict))}
    >
      <p>
        确定要将提交 <CommitName commit={commit} /> 遴选到 <span className="font-medium">{currentName(summary)}</span>{" "}
        吗？
      </p>
      <p className="text-muted-foreground">
        将在当前分支上新建一个包含相同改动的提交。如有冲突，解决后提交即可完成遴选。
      </p>
      {merge && (
        <Warning>
          这是一个合并提交：将应用它相对于第一个父提交{" "}
          <span className="font-mono">{commit.parents[0]?.slice(0, 7)}</span> 的改动（-m 1）。
        </Warning>
      )}
      {cherryPick.error && !isConflict(cherryPick.error) && (
        <OperationErrorNotice error={cherryPick.error} onDismiss={() => cherryPick.reset()} />
      )}
    </OperationSheet>
  )
}
