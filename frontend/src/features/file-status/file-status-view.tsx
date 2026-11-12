import { useQuery } from "@tanstack/react-query"
import { ChevronDown, Ellipsis, X } from "lucide-react"
import { useState } from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { DiffPanel } from "@/features/diff/diff-panel"
import { describeChange, shortenPath } from "@/features/diff/file-path"
import { FileStatusIcon } from "@/features/diff/file-status-icon"
import { useApi } from "@/lib/api/context"
import { useOperation } from "@/lib/api/use-operation"
import {
  diffRequestFor,
  type FileChange,
  fileDiffQuery,
  type WorktreeStatus,
  worktreeStatusQuery,
} from "@/lib/api/worktree"
import { cn } from "@/lib/utils"
import { CommitPanel } from "./commit-panel"
import { type Area, toggleRequest } from "./staging"

type Selection = { path: string; area: Area }

const byPath = (a: FileChange, b: FileChange) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

/** The two lists the view shows. Conflicted and untracked files are listed with the unstaged ones. */
function fileGroups(status?: WorktreeStatus): Record<Area, FileChange[]> {
  if (!status) return { staged: [], unstaged: [] }
  return {
    staged: [...status.staged].sort(byPath),
    unstaged: [...status.conflicted, ...status.unstaged, ...status.untracked].sort(byPath),
  }
}

/** The selected file if it is still listed, otherwise the first file (staged first). */
function resolveSelection(groups: Record<Area, FileChange[]>, selected?: Selection) {
  if (selected) {
    const file = groups[selected.area].find((change) => change.path === selected.path)
    if (file) return { file, area: selected.area }
  }
  const area: Area = groups.staged.length ? "staged" : "unstaged"
  const file = groups[area][0]
  return file ? { file, area } : undefined
}

/**
 * 文件状态: staged and unstaged files of the working tree on the left, the
 * selected file's diff on the right, the commit area below. Checking a file
 * stages it, unchecking unstages it; the group title's checkbox does so for
 * every file in the group.
 */
export function FileStatusView({ repoId }: { repoId: string }) {
  const api = useApi()
  const status = useQuery(worktreeStatusQuery(api, repoId))
  const stage = useOperation(repoId, "stage")
  const unstage = useOperation(repoId, "unstage")
  const [selected, setSelected] = useState<Selection>()

  const groups = fileGroups(status.data)
  const resolved = resolveSelection(groups, selected)
  const request = resolved ? diffRequestFor(resolved.file, resolved.area) : undefined
  const diff = useQuery({
    ...fileDiffQuery(api, repoId, request ?? { source: "unstaged", path: "" }),
    enabled: !!request,
  })

  const select = (path: string, area: Area) => setSelected({ path, area })
  const busy = stage.isPending || unstage.isPending
  const toggle = (area: Area, files: FileChange[]) => {
    const toggled = toggleRequest(area, files)
    if (!toggled || busy) return
    stage.reset()
    unstage.reset()
    const mutation = toggled.op === "stage" ? stage : unstage
    mutation.mutate(toggled.request, {
      onSuccess: () => {
        // Keep a single moved file selected on its new side.
        if (files.length === 1 && resolved?.file.path === files[0]?.path) {
          setSelected({ path: files[0].path, area: area === "staged" ? "unstaged" : "staged" })
        }
      },
    })
  }
  const toggleError = stage.error ?? unstage.error

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
              {toggleError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 border-b bg-destructive/5 px-3 py-1.5 text-destructive"
                >
                  <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">
                    {stage.error ? "暂存失败：" : "取消暂存失败："}
                    {toggleError.message}
                  </span>
                  <button
                    type="button"
                    aria-label="关闭错误"
                    className="rounded p-0.5 hover:bg-accent"
                    onClick={() => {
                      stage.reset()
                      unstage.reset()
                    }}
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
              placeholder={placeholder}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle orientation="vertical" />
      <ResizablePanel minSize="18%">
        <CommitPanel repoId={repoId} stagedCount={groups.staged.length} />
      </ResizablePanel>
    </ResizablePanelGroup>
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
                aria-label={`${staged ? "取消暂存" : "暂存"} ${file.path}`}
                title={conflicted ? "冲突文件需先解决冲突" : undefined}
                checked={staged}
                disabled={busy || conflicted}
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
