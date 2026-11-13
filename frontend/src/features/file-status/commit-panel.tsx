import { useQuery } from "@tanstack/react-query"
import { Check, ChevronDown, X } from "lucide-react"
import { DropdownMenu } from "radix-ui"
import { useState } from "react"
import { useWritesBlocked } from "@/features/jobs/write-block"
import { pushTarget, pushTargetName } from "@/features/remote/remotes"
import { ApiError } from "@/lib/api/client"
import { useApi } from "@/lib/api/context"
import { refsQuery } from "@/lib/api/history"
import { repoSummaryQuery } from "@/lib/api/queries"
import { useStartJob } from "@/lib/api/use-job"
import { useOperation } from "@/lib/api/use-operation"
import { commitCommand } from "@/lib/command-preview"
import { canCommit } from "./staging"

/**
 * The commit area under the file lists: identity, message, 提交选项 (skip
 * hooks), 更正上一次提交 (amend) and the commit button. A failed hook's
 * output is shown above the message. While merging, cherry-picking or
 * reverting, the message starts as the one git prepared, and committing
 * concludes it. With 立即推送,
 * a successful commit starts a push of the current branch to its upstream
 * (or, tracking it from then on, to the same name on the default remote).
 */
export function CommitPanel({
  repoId,
  stagedCount,
  conflictedCount,
}: {
  repoId: string
  stagedCount: number
  conflictedCount: number
}) {
  const api = useApi()
  const summary = useQuery(repoSummaryQuery(api, repoId)).data
  const refs = useQuery(refsQuery(api, repoId)).data
  const commit = useOperation(repoId, "commit")
  const push = useStartJob(repoId, "push")
  const [pushAfterCommit, setPushAfterCommit] = useState(false)
  // undefined until the user edits the message: it then shows the default.
  const [draft, setDraft] = useState<string>()
  const [amend, setAmend] = useState(false)
  const [noVerify, setNoVerify] = useState(false)

  const empty = summary?.empty ?? false
  const merging = summary?.state === "merging"
  // Committing concludes a merge, cherry-pick or revert in progress; git
  // prepared its message, and it cannot be amended into the last commit.
  const concluding = merging || summary?.state === "cherry-picking" || summary?.state === "reverting"
  const message = draft ?? (concluding ? (summary?.mergeMessage ?? "") : "")
  const request = { message, amend: amend && !concluding, noVerify }
  const target = summary?.branch ? pushTarget(refs, summary.branch) : undefined
  const blocked = useWritesBlocked(repoId)
  const enabled =
    !commit.isPending &&
    !blocked &&
    canCommit({ stagedCount, message, amend: request.amend, empty, merging, conflictedCount })
  const submit = () => {
    if (!enabled) return
    commit.mutate(request, {
      onSuccess: () => {
        setDraft(undefined)
        setAmend(false)
        // The job strip shows how the push went.
        if (pushAfterCommit && target) push.mutate({ remote: target.remote, branches: [target.branch] })
      },
    })
  }

  const identity = summary?.identity
  const hasIdentity = !!identity?.name && !!identity.email
  const targetName = target ? pushTargetName(target) : summary?.branch ? `origin/${summary.branch}` : "origin"

  return (
    <div className="flex h-full flex-col gap-2 bg-muted/30 px-3 pt-2 pb-3">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
          {identity?.name?.[0]?.toUpperCase() ?? "?"}
        </span>
        {hasIdentity ? (
          <span className="min-w-0 truncate font-semibold">
            {identity.name} &lt;{identity.email}&gt;
          </span>
        ) : (
          <span className="min-w-0 truncate text-destructive">
            未设置提交身份：请先运行 git config user.name 与 git config user.email
          </span>
        )}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="ml-auto flex shrink-0 items-center gap-0.5 rounded px-1 hover:bg-accent">
            提交选项…
            <ChevronDown className="size-3" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-50 min-w-48 rounded-lg border bg-popover p-1 text-[12px] text-popover-foreground shadow-xl"
            >
              <DropdownMenu.CheckboxItem
                checked={noVerify}
                onCheckedChange={setNoVerify}
                className="flex cursor-default items-center gap-2 rounded px-2 py-1 outline-none select-none data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground"
              >
                <span className="flex size-3.5 items-center justify-center">
                  <DropdownMenu.ItemIndicator>
                    <Check className="size-3.5" />
                  </DropdownMenu.ItemIndicator>
                </span>
                跳过 hooks（--no-verify）
              </DropdownMenu.CheckboxItem>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {commit.error && <CommitError error={commit.error} onDismiss={() => commit.reset()} />}
      <textarea
        value={message}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            submit()
          }
        }}
        aria-label="提交信息"
        placeholder={empty ? "首次提交的信息" : merging ? "合并提交的信息" : "提交信息"}
        className="min-h-0 flex-1 resize-none rounded border bg-background p-2 outline-none focus:ring-2 focus:ring-ring/40"
      />
      <div className="flex items-center gap-4">
        <label
          className={target ? "flex items-center gap-1.5" : "flex items-center gap-1.5 opacity-50"}
          title={target ? undefined : summary?.branch ? "仓库没有远程仓库" : "HEAD 处于分离状态"}
        >
          <input
            type="checkbox"
            aria-label={`立即推送变更到 ${targetName}`}
            checked={pushAfterCommit && !!target}
            disabled={!target}
            onChange={(event) => setPushAfterCommit(event.target.checked)}
          />
          立即推送变更到 {targetName}
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            aria-label="更正上一次提交"
            checked={request.amend}
            disabled={empty || concluding}
            onChange={(event) => setAmend(event.target.checked)}
          />
          更正上一次提交
        </label>
        {noVerify && <span className="rounded bg-warning/25 px-1.5 text-foreground">将跳过 hooks</span>}
        <button
          type="button"
          onClick={() => {
            setDraft(undefined)
            commit.reset()
          }}
          className="ml-auto h-6 min-w-14 rounded-md border bg-background px-3 shadow-xs"
        >
          取消
        </button>
        <button
          type="button"
          disabled={!enabled}
          onClick={submit}
          title={
            blocked ??
            (conflictedCount ? "解决所有冲突文件后才能提交" : message.trim() ? commitCommand(request) : undefined)
          }
          className="h-6 min-w-14 rounded-md bg-primary px-3 text-primary-foreground shadow-xs disabled:opacity-40"
        >
          {commit.isPending ? "正在提交…" : "提交"}
        </button>
      </div>
    </div>
  )
}

function CommitError({ error, onDismiss }: { error: Error; onDismiss: () => void }) {
  const apiError = error instanceof ApiError ? error : undefined
  const hookFailed = apiError?.code === "hook_failed"
  const output = apiError?.output || error.message
  return (
    <div role="alert" className="flex max-h-[45%] min-h-0 flex-col rounded border border-destructive/40 bg-background">
      <div className="flex items-center gap-2 px-2 py-1 font-medium text-destructive">
        <span className="min-w-0 flex-1 truncate">
          {hookFailed ? "提交被 hook 拒绝，未创建提交。修复问题后重试，或在提交选项中跳过 hooks。" : "提交失败"}
        </span>
        <button type="button" onClick={onDismiss} aria-label="关闭错误" className="rounded p-0.5 hover:bg-accent">
          <X className="size-3.5" />
        </button>
      </div>
      <pre className="min-h-0 overflow-auto border-t px-2 py-1 font-mono text-[11px] whitespace-pre-wrap">{output}</pre>
    </div>
  )
}
