import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { ChangesView, type ListedChange } from "@/features/changes/changes-view"
import { useApi } from "@/lib/api/context"
import { type Stash, type StashDetails, stashFileDiffQuery, stashQuery } from "@/lib/api/stashes"
import type { FileChange } from "@/lib/api/worktree"
import { formatFullDate } from "@/lib/dates"
import type { StashAction } from "./stash-sheets"

const byPath = (a: FileChange, b: FileChange) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

/**
 * A stash's saved files, its details with 应用 / 删除 buttons, and the
 * selected file's diff. Remount it (with `key`) when showing another stash.
 */
export function StashView({
  repoId,
  stash,
  onAction,
  onReveal,
}: {
  repoId: string
  stash: Stash
  /** Asks to apply or delete the stash; the caller confirms first. */
  onAction: (action: StashAction) => void
  /** Show a commit in the history view. */
  onReveal: (oid: string) => void
}) {
  const api = useApi()
  const details = useQuery(stashQuery(api, repoId, stash))
  // Untracked files get their own ids: a path can be both deleted from the
  // index and saved as an untracked file.
  const files: ListedChange[] = [...(details.data?.files ?? [])]
    .sort(byPath)
    .map((change) => ({ id: `${change.status === "untracked" ? "untracked" : "tracked"}:${change.path}`, change }))

  let notice: { text: string; error?: boolean } | undefined
  if (details.error) notice = { text: `无法加载贮藏：${details.error.message}`, error: true }
  else if (!details.data) notice = { text: "正在加载贮藏…" }
  else if (!files.length) notice = { text: "此贮藏没有文件更改" }

  return (
    <ChangesView
      files={files}
      notice={notice}
      details={
        <StashMeta
          stash={stash}
          details={details.data}
          onAction={(kind) => onAction({ kind, stash })}
          onReveal={onReveal}
        />
      }
      diffQuery={(file) => stashFileDiffQuery(api, repoId, stash.oid, file.change)}
    />
  )
}

function StashMeta({
  stash,
  details,
  onAction,
  onReveal,
}: {
  stash: Stash
  details?: StashDetails
  onAction: (kind: StashAction["kind"]) => void
  onReveal: (oid: string) => void
}) {
  return (
    <section className="h-full space-y-2 overflow-y-auto px-4 py-3" aria-label="贮藏信息">
      <p className="font-medium break-words">{stash.message}</p>
      <dl className="space-y-0.5">
        <MetaRow label="贮藏">{stash.name}</MetaRow>
        <MetaRow label="提交">
          <span className="font-mono select-all">{stash.oid}</span>
        </MetaRow>
        <MetaRow label="基于">
          {details ? (
            <button
              type="button"
              title={`在历史中显示 ${details.base}`}
              onClick={() => onReveal(details.base)}
              className="font-mono text-primary underline"
            >
              {details.base.slice(0, 10)}
            </button>
          ) : (
            "…"
          )}
        </MetaRow>
        <MetaRow label="日期">{formatFullDate(new Date(stash.time * 1000))}</MetaRow>
      </dl>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => onAction("apply")}
          className="h-6 min-w-16 rounded-md border bg-background px-3 shadow-xs"
        >
          应用贮藏
        </button>
        <button
          type="button"
          onClick={() => onAction("drop")}
          className="h-6 min-w-16 rounded-md border bg-background px-3 text-destructive shadow-xs"
        >
          删除贮藏
        </button>
      </div>
    </section>
  )
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2">
      <dt className="text-right text-muted-foreground">{label}：</dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </div>
  )
}
