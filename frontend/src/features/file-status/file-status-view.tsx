import { useQuery } from "@tanstack/react-query"
import { ChevronDown, Ellipsis, X } from "lucide-react"
import { useState } from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { DiffPanel, type HunkAction } from "@/features/diff/diff-panel"
import { describeChange, shortenPath } from "@/features/diff/file-path"
import { FileStatusIcon } from "@/features/diff/file-status-icon"
import type { DiffHunk } from "@/features/diff/parse-diff"
import { useWritesBlocked } from "@/features/jobs/write-block"
import { OperationSheet } from "@/features/operations/operation-sheet"
import { useApi } from "@/lib/api/context"
import type { FilesRequest, HunkRequest } from "@/lib/api/operations"
import { useOperation } from "@/lib/api/use-operation"
import {
  diffRequestFor,
  type FileChange,
  fileDiffQuery,
  type WorktreeStatus,
  worktreeStatusQuery,
} from "@/lib/api/worktree"
import { discardHunkCommand, stageCommand } from "@/lib/command-preview"
import { cn } from "@/lib/utils"
import { CommitPanel } from "./commit-panel"
import { type Area, type HunkOperation, hunkOperations, hunkRequest, toggleRequest } from "./staging"

type Selection = { path: string; area: Area }

const hunkLabels: Record<HunkOperation, string> = {
  stageHunk: "暂存区块",
  unstageHunk: "取消暂存区块",
  discardHunk: "丢弃区块",
}

const byPath = (a: FileChange, b: FileChange) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

/** The two lists the view shows. Conflicted and untracked files are listed with the unstaged ones. */
function fileGroups(status?: WorktreeStatus): Record<Area, FileChange[]> {
  if (!status) return { staged: [], unstaged: [] }
  return {
    staged: [...status.staged].sort(byPath),
    unstaged: [...status.conflicted, ...status.unstaged, ...status.untracked].sort(byPath),
  }
}

/**
 * The selected file if it is still listed; if it moved to the other list (its
 * last hunk was staged or unstaged), the file there; otherwise the first file
 * (staged first).
 */
function resolveSelection(groups: Record<Area, FileChange[]>, selected?: Selection) {
  if (selected) {
    const other: Area = selected.area === "staged" ? "unstaged" : "staged"
    for (const area of [selected.area, other]) {
      const file = groups[area].find((change) => change.path === selected.path)
      if (file) return { file, area }
    }
  }
  const area: Area = groups.staged.length ? "staged" : "unstaged"
  const file = groups[area][0]
  return file ? { file, area } : undefined
}

/**
 * 文件状态: staged and unstaged files of the working tree on the left, the
 * selected file's diff on the right, the commit area below. Checking a file
 * stages it, unchecking unstages it; the group title's checkbox does so for
 * every file in the group. Each hunk of the diff can be staged, unstaged or,
 * after confirmation, discarded on its own.
 */
export function FileStatusView({ repoId }: { repoId: string }) {
  const api = useApi()
  const status = useQuery(worktreeStatusQuery(api, repoId))
  const stage = useOperation(repoId, "stage")
  const unstage = useOperation(repoId, "unstage")
  const stageHunk = useOperation(repoId, "stageHunk")
  const unstageHunk = useOperation(repoId, "unstageHunk")
  const discardHunk = useOperation(repoId, "discardHunk")
  const [selected, setSelected] = useState<Selection>()
  const [discarding, setDiscarding] = useState<{ file: FileChange; hunk: DiffHunk }>()
  const [resolving, setResolving] = useState<{ request: FilesRequest; paths: string[]; files: FileChange[] }>()

  const groups = fileGroups(status.data)
  const resolved = resolveSelection(groups, selected)
  const request = resolved ? diffRequestFor(resolved.file, resolved.area) : undefined
  const diff = useQuery({
    ...fileDiffQuery(api, repoId, request ?? { source: "unstaged", path: "" }),
    enabled: !!request,
  })

  const select = (path: string, area: Area) => setSelected({ path, area })
  // Every change waits for the previous one and the refresh after it, so a
  // hunk button never acts on a diff that is out of date.
  const writes = [
    { mutation: stage, failed: "暂存失败：" },
    { mutation: unstage, failed: "取消暂存失败：" },
    { mutation: stageHunk, failed: "暂存区块失败：" },
    { mutation: unstageHunk, failed: "取消暂存区块失败：" },
    { mutation: discardHunk, failed: "丢弃区块失败：" },
  ]
  // While a background job holds the write lock, staging would wait for it.
  const blocked = useWritesBlocked(repoId)
  const busy = !!blocked || writes.some(({ mutation }) => mutation.isPending)
  const failure = writes.find(({ mutation }) => mutation.error)
  const resetErrors = () => {
    for (const { mutation } of writes) mutation.reset()
  }
  const toggle = (area: Area, files: FileChange[]) => {
    const toggled = toggleRequest(area, files)
    if (!toggled || busy) return
    if (toggled.resolves.length) {
      setResolving({ request: toggled.request, paths: toggled.resolves, files })
      return
    }
    run(area, files, toggled.op, toggled.request)
  }
  const run = (area: Area, files: FileChange[], op: "stage" | "unstage", request: FilesRequest) => {
    resetErrors()
    const mutation = op === "stage" ? stage : unstage
    mutation.mutate(request, {
      onSuccess: () => {
        // Keep a single moved file selected on its new side.
        if (files.length === 1 && resolved?.file.path === files[0]?.path) {
          setSelected({ path: files[0].path, area: area === "staged" ? "unstaged" : "staged" })
        }
      },
    })
  }

  const hunkMutations = { stageHunk, unstageHunk, discardHunk }
  const runHunk = (op: HunkOperation, request: HunkRequest) => {
    if (busy) return
    resetErrors()
    // Stay on this side of the file even when it was only selected by
    // default: once part of it is staged it is listed on both sides, and the
    // default (staged first) would jump away from the hunks still to review.
    if (resolved) setSelected({ path: resolved.file.path, area: resolved.area })
    hunkMutations[op].mutate(request)
  }
  const hunkActions: HunkAction[] = resolved
    ? hunkOperations(resolved.area, resolved.file).map((op) => ({
        label: hunkLabels[op],
        tone: op === "discardHunk" ? "danger" : undefined,
        disabled: busy,
        onClick: (hunk) => {
          if (op === "discardHunk") setDiscarding({ file: resolved.file, hunk })
          else runHunk(op, hunkRequest(resolved.file, resolved.area, hunk))
        },
      }))
    : []

  let placeholder = "选择一个文件查看差异"
  if (status.isPending) placeholder = "正在读取文件状态…"
  else if (status.data && !groups.staged.length && !groups.unstaged.length) placeholder = "工作区没有改动"

  return (
    <ResizablePanelGroup orientation="vertical">
      <ResizablePanel defaultSize="72%" minSize="40%">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="36%" minSize="20%">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-7 shrink-0 items-center gap-2 border-b bg-muted/40 px-3 text-[11px]">
                <span className="flex items-center gap-0.5">
                  待定的文件，已依照路径排序
                  <ChevronDown className="size-3" />
                </span>
                <span className="flex items-center gap-0.5 text-muted-foreground">
                  <Ellipsis className="size-3.5" />
                  <ChevronDown className="size-3" />
                </span>
              </div>
              {blocked && (
                <div role="status" className="border-b bg-muted px-3 py-1 text-muted-foreground">
                  {blocked}
                </div>
              )}
              {failure && (
                <div
                  role="alert"
                  className="flex items-start gap-2 border-b bg-destructive/5 px-3 py-1.5 text-destructive"
                >
                  <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">
                    {failure.failed}
                    {failure.mutation.error?.message}
                  </span>
                  <button
                    type="button"
                    aria-label="关闭错误"
                    className="rounded p-0.5 hover:bg-accent"
                    onClick={resetErrors}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}
              {status.error ? (
                <div role="alert" className="p-3 text-destructive">
                  无法读取文件状态：{status.error.message}
                </div>
              ) : (
                <div className="min-h-0 flex-1">
                  <ResizablePanelGroup orientation="vertical">
                    <ResizablePanel defaultSize="50%" minSize="15%">
                      <FileList
                        title="已暂存文件"
                        area="staged"
                        files={groups.staged}
                        selected={resolved?.area === "staged" ? resolved.file.path : undefined}
                        busy={busy}
                        onSelect={select}
                        onToggle={toggle}
                      />
                    </ResizablePanel>
                    <ResizableHandle orientation="vertical" />
                    <ResizablePanel minSize="15%">
                      <FileList
                        title="未暂存文件"
                        area="unstaged"
                        files={groups.unstaged}
                        selected={resolved?.area === "unstaged" ? resolved.file.path : undefined}
                        busy={busy}
                        onSelect={select}
                        onToggle={toggle}
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </div>
              )}
            </div>
          </ResizablePanel>
          <ResizableHandle orientation="horizontal" />
          <ResizablePanel>
            <DiffPanel
              file={resolved?.file}
              diff={diff.data}
              loading={diff.isFetching}
              error={diff.error}
              hunkActions={hunkActions}
              placeholder={placeholder}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle orientation="vertical" />
      <ResizablePanel minSize="18%">
        <CommitPanel
          repoId={repoId}
          stagedCount={groups.staged.length}
          conflictedCount={status.data?.conflicted.length ?? 0}
        />
      </ResizablePanel>
      {resolving && (
        <MarkResolvedSheet
          paths={resolving.paths}
          command={stageCommand(resolving.request.paths)}
          onClose={() => setResolving(undefined)}
          onConfirm={() => {
            if (!busy) run("unstaged", resolving.files, "stage", resolving.request)
            setResolving(undefined)
          }}
        />
      )}
      {discarding && (
        <DiscardHunkSheet
          {...discarding}
          onClose={() => setDiscarding(undefined)}
          onConfirm={() => {
            runHunk("discardHunk", hunkRequest(discarding.file, "unstaged", discarding.hunk))
            setDiscarding(undefined)
          }}
        />
      )}
    </ResizablePanelGroup>
  )
}

/**
 * Confirms marking conflicted files resolved. Staging records each file as
 * it is now, conflict markers included, and git forgets the conflict's
 * versions, so this is asked first.
 */
function MarkResolvedSheet({
  paths,
  command,
  onClose,
  onConfirm,
}: {
  paths: string[]
  command: string
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <OperationSheet
      title="标记为已解决"
      showTitle
      width={480}
      command={command}
      confirmLabel="标记为已解决"
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <p>将以下冲突文件的当前内容暂存，并标记为已解决：</p>
      <ul className="max-h-32 overflow-y-auto rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-[11px]">
        {paths.map((path) => (
          <li key={path} className="truncate" title={path}>
            {path}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        请确认文件中已没有冲突标记（{"<<<<<<<、=======、>>>>>>>"}）。标记后，冲突双方的版本将不再保留。
      </p>
    </OperationSheet>
  )
}

/** Confirms 丢弃区块: the hunk's unstaged change is lost for good. */
function DiscardHunkSheet({
  file,
  hunk,
  onClose,
  onConfirm,
}: {
  file: FileChange
  hunk: DiffHunk
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <OperationSheet
      title="丢弃区块"
      showTitle
      width={460}
      command={discardHunkCommand()}
      confirmLabel="丢弃"
      destructive
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <p className="break-words">
        确定要丢弃 <span className="font-medium">{file.path}</span> 的块 {hunk.index}（行 {hunk.from}-{hunk.to}
        ）中未暂存的改动吗？
      </p>
      <p className="text-destructive">
        {file.status === "untracked" ? "这是未跟踪文件，丢弃将删除整个文件，" : "工作区中的这些改动将被还原，"}
        此操作无法撤销。
      </p>
    </OperationSheet>
  )
}

function FileList({
  title,
  area,
  files,
  selected,
  busy,
  onSelect,
  onToggle,
}: {
  title: string
  area: Area
  files: FileChange[]
  selected?: string
  /** A stage or unstage is running; checkboxes wait for it. */
  busy: boolean
  onSelect: (path: string, area: Area) => void
  onToggle: (area: Area, files: FileChange[]) => void
}) {
  const staged = area === "staged"
  const canToggleAll = !!toggleRequest(area, files)
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={title}>
      <label className="flex h-8 shrink-0 items-center gap-2 px-3">
        <input
          type="checkbox"
          aria-label={staged ? "取消暂存全部文件" : "暂存全部文件"}
          checked={staged && files.length > 0}
          disabled={busy || !canToggleAll}
          onChange={() => onToggle(area, files)}
        />
        {title}
      </label>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2">
        {files.map((file) => {
          const active = selected === file.path
          const conflicted = file.status === "conflicted"
          return (
            <li
              key={file.path}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-[3px]",
                active ? "bg-primary text-primary-foreground" : "hover:bg-accent/60",
              )}
            >
              <input
                type="checkbox"
                aria-label={`${staged ? "取消暂存" : conflicted ? "标记为已解决" : "暂存"} ${file.path}`}
                title={conflicted ? "解决冲突后勾选以标记为已解决（暂存文件）" : undefined}
                checked={staged}
                disabled={busy}
                onChange={() => onToggle(area, [file])}
              />
              <FileStatusIcon status={file.status} />
              <button
                type="button"
                title={describeChange(file)}
                aria-current={active ? "true" : undefined}
                // Right-to-left overflow puts the ellipsis at the start, so a
                // path too wide for the pane still shows its file name.
                dir="rtl"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => onSelect(file.path, area)}
              >
                <bdi dir="ltr">{shortenPath(file.path)}</bdi>
              </button>
              <Ellipsis className="size-4 shrink-0 opacity-70" />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
