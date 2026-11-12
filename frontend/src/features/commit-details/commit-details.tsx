import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { ChangesView, type ListedChange } from "@/features/changes/changes-view"
import type { RefInfo } from "@/features/history/ref-label"
import { type CommitDetails as Commit, commitFileDiffQuery, commitQuery } from "@/lib/api/commits"
import { useApi } from "@/lib/api/context"
import { diffRequestFor, type FileChange, fileDiffQuery, type WorktreeStatus } from "@/lib/api/worktree"
import { formatFullDate } from "@/lib/dates"

const byPath = (a: FileChange, b: FileChange) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

/**
 * The selected commit's changed files, metadata and file diff. Clicking a
 * parent calls `onSelect` with the parent's oid.
 */
export function CommitDetails({
  repoId,
  oid,
  refs,
  onSelect,
}: {
  repoId: string
  oid: string
  /** Refs pointing at the commit, listed as 标签. */
  refs: RefInfo[]
  onSelect: (oid: string) => void
}) {
  const api = useApi()
  const commit = useQuery(commitQuery(api, repoId, oid))
  const files: ListedChange[] = [...(commit.data?.files ?? [])]
    .sort(byPath)
    .map((change) => ({ id: change.path, change }))

  let notice: { text: string; error?: boolean } | undefined
  if (commit.error) notice = { text: `无法加载提交：${commit.error.message}`, error: true }
  else if (!commit.data) notice = { text: "正在加载提交…" }
  else if (!files.length) {
    notice = {
      text:
        commit.data.parents.length > 1 ? "此提交没有文件更改（合并提交，与第一个父提交相比）" : "此提交没有文件更改",
    }
  }

  return (
    <ChangesView
      files={files}
      notice={notice}
      details={commit.data && <CommitMeta commit={commit.data} refs={refs} onSelect={onSelect} />}
      diffQuery={(file) => commitFileDiffQuery(api, repoId, oid, file.change)}
    />
  )
}

type WorktreeFile = ListedChange & { area: "staged" | "unstaged" }

/** The "未提交的更改" row's details: staged and unstaged files of the working tree. */
export function UncommittedChanges({ repoId, status }: { repoId: string; status: WorktreeStatus }) {
  const api = useApi()
  const unstaged = [...status.conflicted, ...status.unstaged, ...status.untracked].sort(byPath)
  const files: WorktreeFile[] = [
    ...[...status.staged]
      .sort(byPath)
      .map((change) => ({ id: `staged:${change.path}`, change, note: "已暂存", area: "staged" as const })),
    ...unstaged.map((change) => ({ id: `unstaged:${change.path}`, change, note: "未暂存", area: "unstaged" as const })),
  ]
  return (
    <ChangesView
      files={files}
      notice={files.length ? undefined : { text: "工作区没有改动" }}
      details={
        <div className="space-y-1 px-4 py-3">
          <p className="font-medium">未提交的更改</p>
          <p className="text-muted-foreground">
            已暂存 {status.staged.length} 个文件，未暂存 {unstaged.length} 个文件
          </p>
        </div>
      }
      diffQuery={(file) => fileDiffQuery(api, repoId, diffRequestFor(file.change, file.area))}
    />
  )
}

function CommitMeta({ commit, refs, onSelect }: { commit: Commit; refs: RefInfo[]; onSelect: (oid: string) => void }) {
  return (
    <section className="h-full space-y-2 overflow-y-auto px-4 py-3" aria-label="提交信息">
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="flex size-7 shrink-0 items-center justify-center rounded border bg-primary/15 font-semibold text-primary"
        >
          {Array.from(commit.author)[0] ?? "?"}
        </span>
        <div className="min-w-0">
          <p className="font-medium break-words">{commit.subject}</p>
          {commit.body && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{commit.body}</p>}
        </div>
      </div>
      <dl className="space-y-0.5">
        <MetaRow label="提交">
          <span className="font-mono select-all">{commit.oid}</span>{" "}
          <span className="font-mono">[{commit.oid.slice(0, 10)}]</span>
        </MetaRow>
        <MetaRow label="父级">
          {commit.parents.length === 0
            ? "无"
            : commit.parents.map((parent) => (
                <button
                  key={parent}
                  type="button"
                  title={`跳转到父提交 ${parent}`}
                  onClick={() => onSelect(parent)}
                  className="mr-2 font-mono text-primary underline"
                >
                  {parent.slice(0, 10)}
                </button>
              ))}
        </MetaRow>
        <MetaRow label="作者">
          {commit.author} &lt;{commit.email}&gt;
        </MetaRow>
        <MetaRow label="日期">{formatFullDate(new Date(commit.authorTime * 1000))}</MetaRow>
        <MetaRow label="提交日期">{formatFullDate(new Date(commit.commitTime * 1000))}</MetaRow>
        {refs.length > 0 && <MetaRow label="标签">{refs.map((ref) => ref.name).join(" ")}</MetaRow>}
      </dl>
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
