import { useQuery } from "@tanstack/react-query"
import { AlertCircle } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { BranchActionsContext, useBranchOperations } from "@/features/branches/branch-operations"
import { FileStatusView } from "@/features/file-status/file-status-view"
import { pendingFileCount } from "@/features/file-status/staging"
import { HistoryView, type Selection } from "@/features/history/history-view"
import { useApi } from "@/lib/api/context"
import { refsQuery } from "@/lib/api/history"
import { repoSummaryQuery, reposQuery } from "@/lib/api/queries"
import type { RepoSummary } from "@/lib/api/repos"
import { worktreeStatusQuery } from "@/lib/api/worktree"
import { CommandLogBar } from "./command-log-bar"
import { Sidebar, type WorkbenchView } from "./sidebar"
import { TitleBar } from "./title-bar"

/** The workbench for the first open repository. */
export function Workbench() {
  const api = useApi()
  const repos = useQuery(reposQuery(api))
  const repoId = repos.data?.[0]?.id
  const summary = useQuery({ ...repoSummaryQuery(api, repoId ?? ""), enabled: !!repoId })

  const error = repos.error ?? summary.error
  if (error) {
    return <LoadError message={error.message} retry={() => void (repos.error ? repos.refetch() : summary.refetch())} />
  }
  if (repos.data && !repoId) return <LoadError message="gitview 没有打开任何仓库。" />
  if (!summary.data) return <Shell />
  return <Shell summary={summary.data} />
}

function Shell({ summary }: { summary?: RepoSummary }) {
  const api = useApi()
  const [view, setView] = useState<WorkbenchView>("history")
  const status = useQuery({ ...worktreeStatusQuery(api, summary?.id ?? ""), enabled: !!summary })
  const [selection, setSelection] = useState<Selection>()
  const refs = useQuery({ ...refsQuery(api, summary?.id ?? ""), enabled: !!summary })
  const select = (oid: string) => setSelection((previous) => ({ oid, seq: (previous?.seq ?? 0) + 1 }))
  const reveal = (oid: string) => {
    if (view === "status") setView("history")
    select(oid)
  }
  const branches = useBranchOperations(summary, refs.data)
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TitleBar
        name={summary?.name ?? ""}
        pendingCount={pendingFileCount(status.data)}
        onCommit={summary ? () => setView("status") : undefined}
        onBranch={branches.actions && (() => branches.actions?.openBranchDialog())}
      />
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="18%" minSize="12%" maxSize="32%">
            {summary ? (
              <BranchActionsContext value={branches.actions}>
                <Sidebar summary={summary} refs={refs.data} view={view} onView={setView} onReveal={reveal} />
              </BranchActionsContext>
            ) : (
              <div className="h-full border-r bg-muted/50" />
            )}
          </ResizablePanel>
          <ResizableHandle orientation="horizontal" />
          <ResizablePanel>
            <main className="h-full" aria-label={summary ? VIEW_LABELS[view] : "正在加载仓库"} aria-busy={!summary}>
              {summary && view === "status" && <FileStatusView repoId={summary.id} />}
              {summary && view !== "status" && (
                <HistoryView
                  summary={summary}
                  refs={refs.data}
                  selection={selection}
                  onSelect={select}
                  searchMode={view === "search"}
                />
              )}
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <CommandLogBar repoId={summary?.id} />
      {branches.dialogs}
    </div>
  )
}

const VIEW_LABELS: Record<WorkbenchView, string> = { status: "文件状态", history: "历史", search: "搜索" }

function LoadError({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <main className="flex h-dvh items-center justify-center bg-background p-6">
      <div role="alert" className="flex max-w-lg gap-3 rounded-md border border-destructive/40 p-4 text-destructive">
        <AlertCircle className="size-4 shrink-0" />
        <div className="space-y-3">
          <p className="font-semibold">无法打开仓库</p>
          <p className="text-foreground">{message}</p>
          {retry && (
            <Button size="sm" variant="outline" onClick={retry}>
              重试
            </Button>
          )}
        </div>
      </div>
    </main>
  )
}
