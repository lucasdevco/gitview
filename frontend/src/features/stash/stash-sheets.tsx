// The 贮藏 dialog and the confirmations for applying and deleting a stash.
import { useState } from "react"
import { useWritesBlocked } from "@/features/jobs/write-block"
import { Check, Field, inputClass, OperationSheet } from "@/features/operations/operation-sheet"
import { ApiError } from "@/lib/api/client"
import type { Stash } from "@/lib/api/stashes"
import { useOperation } from "@/lib/api/use-operation"
import { stashApplyCommand, stashDropCommand, stashPushCommand } from "@/lib/command-preview"

/**
 * 贮藏: saves every change in the working tree, untracked files included,
 * and returns it to a clean state. Confirming is disabled when there is
 * nothing to stash.
 */
export function StashDialog({ repoId, dirty, onClose }: { repoId: string; dirty: boolean; onClose: () => void }) {
  const push = useOperation(repoId, "stashPush")
  const [message, setMessage] = useState("")
  const [keepIndex, setKeepIndex] = useState(false)
  const request = { message, keepIndex }
  const blocked = useWritesBlocked(repoId)
  const enabled = dirty && !push.isPending && !blocked
  const confirm = () => {
    if (enabled) push.mutate(request, { onSuccess: onClose })
  }
  return (
    <OperationSheet
      title="贮藏"
      width={520}
      command={stashPushCommand(request)}
      onClose={onClose}
      confirmLabel={push.isPending ? "正在贮藏…" : "贮藏"}
      disabled={!enabled}
      blockedBy={blocked}
      onConfirm={confirm}
    >
      <p>这样将贮藏所有的变更到你的工作区并且返回到一个干净的工作区状态。</p>
      {!dirty && <p className="text-muted-foreground">工作区没有可贮藏的更改。</p>}
      <Field label="信息">
        <input
          className={inputClass}
          placeholder="可选"
          value={message}
          aria-label="贮藏信息"
          // biome-ignore lint/a11y/noAutofocus: matches Sourcetree's sheet, which focuses the message field
          autoFocus
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) confirm()
          }}
        />
      </Field>
      <div className="pl-[8.5rem]">
        <Check label="保留缓存的变更" checked={keepIndex} onChange={setKeepIndex} />
      </div>
      {push.error && <OperationError title="贮藏失败" error={push.error} />}
    </OperationSheet>
  )
}

export type StashAction = { kind: "apply" | "drop"; stash: Stash }

/** Confirms applying a stash to the working tree, or deleting it for good. */
export function StashActionSheet({
  repoId,
  action: { kind, stash },
  onClose,
}: {
  repoId: string
  action: StashAction
  onClose: () => void
}) {
  const operation = useOperation(repoId, kind === "apply" ? "stashApply" : "stashDrop")
  const blocked = useWritesBlocked(repoId)
  const request = { index: stash.index, oid: stash.oid }
  const apply = kind === "apply"
  // The stash list refreshes from change events, dropping an older stash
  // included (the stash reflog is watched).
  const confirm = () => operation.mutate(request, { onSuccess: onClose })
  return (
    <OperationSheet
      title={apply ? "应用贮藏" : "删除贮藏"}
      showTitle
      width={480}
      command={apply ? stashApplyCommand(request) : stashDropCommand(request)}
      onClose={onClose}
      confirmLabel={operation.isPending ? "正在执行…" : apply ? "应用" : "删除"}
      disabled={operation.isPending}
      blockedBy={blocked}
      onConfirm={confirm}
    >
      <p>
        {apply ? "将贮藏的更改应用到工作区，贮藏仍会保留：" : "确定要删除这个贮藏吗？删除后无法在 gitview 中恢复："}
      </p>
      <p className="rounded-md bg-muted/60 px-2.5 py-1.5">
        <span className="font-mono">{stash.name}</span> <span className="break-words">{stash.message}</span>
      </p>
      {operation.error && (
        <OperationError
          title={
            apply && operation.error instanceof ApiError && operation.error.code === "conflict"
              ? "应用贮藏时出现冲突：贮藏已保留，冲突文件请在“文件状态”中解决。"
              : apply
                ? "应用贮藏失败"
                : "删除贮藏失败"
          }
          error={operation.error}
        />
      )}
    </OperationSheet>
  )
}

function OperationError({ title, error }: { title: string; error: Error }) {
  const output = error instanceof ApiError && error.output ? error.output : error.message
  return (
    <div role="alert" className="rounded border border-destructive/40">
      <p className="px-2 py-1 font-medium text-destructive">{title}</p>
      <pre className="max-h-40 overflow-auto border-t px-2 py-1 font-mono text-[11px] whitespace-pre-wrap">
        {output}
      </pre>
    </div>
  )
}
