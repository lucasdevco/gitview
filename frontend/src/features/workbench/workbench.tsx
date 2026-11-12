import { useQuery } from "@tanstack/react-query"
import { AlertCircle } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { BranchActionsContext, useBranchOperations } from "@/features/branches/branch-operations"
import { FileStatusView } from "@/features/file-status/file-status-view"
import { pendingFileCount } from "@/features/file-status/staging"
import { HistoryView, type Selection } from "@/features/history/history-view"
import { type StashAction, StashActionSheet, StashDialog } from "@/features/stash/stash-sheets"
import { StashView } from "@/features/stash/stash-view"
import { useApi } from "@/lib/api/context"
import { refsQuery } from "@/lib/api/history"
import { repoSummaryQuery, reposQuery } from "@/lib/api/queries"
import type { RepoSummary } from "@/lib/api/repos"
import { stashesQuery } from "@/lib/api/stashes"
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
    if (view !== "history" && view !== "search") setView("history")
    select(oid)
  }
  const branches = useBranchOperations(summary, refs.data)
  const [stashing, setStashing] = useState(false)
  const [stashAction, setStashAction] = useState<StashAction>()
  const [stashOid, setStashOid] = useState<string>()
  const stashes = useQuery({ ...stashesQuery(api, summary?.id ?? ""), enabled: !!summary })
  const stash = stashes.data?.find((entry) => entry.oid === stashOid)
  // A stash that was dropped (here or elsewhere) leaves the history in its place.
  const shown: WorkbenchView = view === "stash" && stashes.data && !stash ? "history" : view
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TitleBar
        name={summary?.name ?? ""}
        pendingCount={pendingFileCount(status.data)}
        onCommit={summary ? () => setView("status") : undefined}
        onBranch={branches.actions && (() => branches.actions?.openBranchDialog())}
        onStash={summary ? () => setStashing(true) : undefined}
      />
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="18%" minSize="12%" maxSize="32%">
            {summary ? (
              <BranchActionsContext value={branches.actions}>
                <Sidebar
                  summary={summary}
                  refs={refs.data}
                  view={shown}
                  onView={setView}
                  onReveal={reveal}
                  selectedStash={stash?.oid}
                  onSelectStash={(selected) => {
                    setStashOid(selected.oid)
                    setView("stash")
                  }}
                  onStashAction={setStashAction}
                />
              </BranchActionsContext>
            ) : (
              <div className="h-full border-r bg-muted/50" />
            )}
          </ResizablePanel>
          <ResizableHandle orientation="horizontal" />
          <ResizablePanel>
            <main className="h-full" aria-label={summary ? VIEW_LABELS[shown] : "正在加载仓库"} aria-busy={!summary}>
              {summary && shown === "status" && <FileStatusView repoId={summary.id} />}
              {summary && shown === "stash" && stash && (
                <StashView
                  key={stash.oid}
                  repoId={summary.id}
                  stash={stash}
                  onAction={setStashAction}
                  onReveal={reveal}
                />
              )}
              {summary && (shown === "history" || shown === "search") && (
                <HistoryView
                  summary={summary}
                  refs={refs.data}
                  selection={selection}
                  onSelect={select}
                  searchMode={shown === "search"}
                />
              )}
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <CommandLogBar repoId={summary?.id} />
      {branches.dialogs}
      {summary && stashing && (
        <StashDialog repoId={summary.id} dirty={pendingFileCount(status.data) > 0} onClose={() => setStashing(false)} />
      )}
      {summary && stashAction && (
        <StashActionSheet repoId={summary.id} action={stashAction} onClose={() => setStashAction(undefined)} />
      )}
    </div>
  )
}

const VIEW_LABELS: Record<WorkbenchView, string> = {
  status: "文件状态",
  history: "历史",
  search: "搜索",
  stash: "贮藏",
}

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
