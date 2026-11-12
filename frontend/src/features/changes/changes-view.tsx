import { type QueryKey, type UseQueryOptions, useQuery } from "@tanstack/react-query"
import { ChevronDown } from "lucide-react"
import { type ReactNode, useState } from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { DiffPanel } from "@/features/diff/diff-panel"
import { describeChange, shortenPath } from "@/features/diff/file-path"
import { FileStatusIcon } from "@/features/diff/file-status-icon"
import type { FileChange, FileDiff } from "@/lib/api/worktree"
import { cn } from "@/lib/utils"

/**
 * A file in a {@link ChangesView} list. `id` must be unique in the list (the
 * same path can appear twice, e.g. staged and unstaged); `note` is a short
 * muted label after the path.
 */
export type ListedChange = { id: string; change: FileChange; note?: string }

/** How to load the diff of a listed file, e.g. `(file) => fileDiffQuery(...)`. */
export type DiffQuery<T, K extends QueryKey> = (file: T) => UseQueryOptions<FileDiff, Error, FileDiff, K>

export type ChangesViewProps<T extends ListedChange, K extends QueryKey> = {
  /** Files in display order. The first one is selected until the user picks another. */
  files: T[]
  /** Shown in the file list instead of the files: loading, an error, or why the list is empty. */
  notice?: { text: string; error?: boolean }
  /** The lower-left pane, e.g. commit metadata. */
  details: ReactNode
  diffQuery: DiffQuery<T, K>
}

/**
 * A set of changed files and the selected file's diff, laid out as in
 * Sourcetree's history: file list above `details` on the left, diff on the
 * right. It knows nothing about where the files come from, so commits, the
 * working tree and stashes all use it. Remount it (with `key`) to reset the
 * selection when showing another change set.
 */
export function ChangesView<T extends ListedChange, K extends QueryKey>({
  files,
  notice,
  details,
  diffQuery,
}: ChangesViewProps<T, K>) {
  const [selectedId, setSelectedId] = useState<string>()
  const selected = files.find((file) => file.id === selectedId) ?? files[0]

  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize="40%" minSize="20%">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-7 shrink-0 items-center gap-0.5 border-b bg-muted/40 px-3 text-[11px]">
            已依照路径排序
            <ChevronDown className="size-3" />
          </div>
          <div className="min-h-0 flex-1">
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel defaultSize="38%" minSize="15%">
                <FileList files={files} notice={notice} selected={selected?.id} onSelect={setSelectedId} />
              </ResizablePanel>
              <ResizableHandle orientation="vertical" />
              <ResizablePanel minSize="20%">{details}</ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle orientation="horizontal" />
      <ResizablePanel>
        {selected ? (
          <SelectedDiff file={selected} diffQuery={diffQuery} />
        ) : (
          <DiffPanel placeholder={files.length ? undefined : "没有可显示的差异"} />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function SelectedDiff<T extends ListedChange, K extends QueryKey>({
  file,
  diffQuery,
}: {
  file: T
  diffQuery: DiffQuery<T, K>
}) {
  const diff = useQuery(diffQuery(file))
  return <DiffPanel file={file.change} diff={diff.data} loading={diff.isFetching} error={diff.error} />
}

function FileList<T extends ListedChange>({
  files,
  notice,
  selected,
  onSelect,
}: {
  files: T[]
  notice?: { text: string; error?: boolean }
  selected?: string
  onSelect: (id: string) => void
}) {
  if (notice) {
    return (
      <p
        role={notice.error ? "alert" : undefined}
        className={cn("px-4 py-2", notice.error ? "text-destructive" : "text-muted-foreground")}
      >
        {notice.text}
      </p>
    )
  }
  return (
    <ul className="h-full overflow-y-auto px-2 py-1" aria-label="更改的文件">
      {files.map((file) => {
        const active = selected === file.id
        return (
          <li key={file.id}>
            <button
              type="button"
              title={describeChange(file.change)}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(file.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-[3px] text-left",
                active ? "bg-primary text-primary-foreground" : "hover:bg-accent/60",
              )}
            >
              <FileStatusIcon status={file.change.status} />
              {/* Right-to-left overflow keeps the file name visible when the path is too wide. */}
              <span dir="rtl" className="min-w-0 flex-1 truncate">
                <bdi dir="ltr">{shortenPath(describeChange(file.change))}</bdi>
              </span>
              {file.note && <span className="shrink-0 text-[11px] opacity-70">{file.note}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
