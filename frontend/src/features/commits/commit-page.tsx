import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, FileCode2, GitCommitHorizontal, RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { commitQueryOptions } from "@/lib/queries"
import { useI18n } from "@/lib/i18n"
import type { PatchFile } from "@/lib/api"
import type { OverviewRouteSearch } from "@/lib/url-filters"
import { DiffView } from "@/features/commits/diff-view"

export function CommitPage({ commitId, search }: { commitId: string; search: OverviewRouteSearch }) {
  const { t, formatDate, formatNumber } = useI18n()
  const query = useQuery(commitQueryOptions(commitId))
  const report = query.data
  if (!report && query.isPending) return <Loading />
  if (!report) return <ErrorPage message={query.error instanceof Error ? query.error.message : t("Unable to load commit")} />
  const { repository, commit } = report.data
  return <div className="flex min-h-[calc(100dvh-2.75rem)] flex-col bg-background">
    {query.isFetching && <Progress value={35} className="fixed inset-x-0 top-11 z-[105] h-0.5 rounded-none" />}
    <PageHeader
      context={<><Button variant="ghost" size="icon-xs" asChild><Link to="/" search={search} aria-label={t("Back to overview")} title={t("Back to overview")}><ArrowLeft /></Link></Button><GitCommitHorizontal className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><div className="truncate text-xs font-semibold">{commit.subject || commit.oid.slice(0, 8)}</div><div className="truncate font-mono text-[9px] text-muted-foreground">{repository.name} · {commit.oid}</div></div></>}
      actions={<Button variant="ghost" size="xs" className="w-[4.5rem]" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />{t("Refresh")}</Button>}
    />
    <main className="flex-1 space-y-4 p-4 pb-10">
      <div><h1 className="text-base font-semibold">{t("Commit review")}</h1><p className="text-[11px] text-muted-foreground">{t("Code changes introduced by this commit")}</p></div>
      <Card className="gap-3 rounded-md p-3 shadow-none">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="font-mono">{commit.oid.slice(0, 12)}</Badge><span className="text-sm font-semibold">{commit.subject}</span></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground"><span>{commit.author} &lt;{commit.author_email}&gt;</span><span>{formatDate(commit.authored_at)}</span>{commit.parent_oid && <span>{t("Parent")}: <span className="font-mono">{commit.parent_oid.slice(0, 12)}</span></span>}</div>
      </Card>
      <section className="grid grid-cols-3 gap-2">
        <Metric label={t("Files changed")} value={formatNumber(commit.files)} />
        <Metric label={t("Additions")} value={`+${formatNumber(commit.additions)}`} tone="text-success" />
        <Metric label={t("Deletions")} value={`−${formatNumber(commit.deletions)}`} tone="text-destructive" />
      </section>
      <CommitChanges patch={commit.patch} patchFiles={commit.patch_files} />
    </main>
    <footer className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center gap-2 border-t bg-card/95 px-3 text-[10px] text-muted-foreground"><span className="text-success">● {t("Ready")}</span><span>·</span><span className="font-mono">{commit.oid.slice(0, 12)}</span><span className="ml-auto">{t("schema")} {report.schema_version}</span></footer>
  </div>
}

function CommitChanges({ patch, patchFiles }: { patch: string; patchFiles: PatchFile[] }) {
  const { t } = useI18n()
  const [selectedFile, setSelectedFile] = useState(() => patchFiles[0]?.path ?? "")

  useEffect(() => setSelectedFile(patchFiles[0]?.path ?? ""), [patchFiles])

  if (!patch) return <Card className="gap-0 overflow-hidden rounded-md py-0 shadow-none"><div className="border-b px-3 py-2 text-xs font-semibold">{t("Unified diff")}</div><div className="p-12 text-center text-xs text-muted-foreground">{t("No textual changes in this commit.")}</div></Card>

  return <Card className="grid gap-0 overflow-hidden rounded-md py-0 shadow-none md:grid-cols-[16rem_minmax(0,1fr)]">
    <aside className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
      <div className="flex h-9 shrink-0 items-center border-b px-3 text-xs font-semibold"><span>{t("Changed files")}</span><Badge variant="secondary" className="ml-auto h-5">{patchFiles.length}</Badge></div>
      <div className="max-h-44 overflow-auto p-1.5 md:max-h-[calc(100vh-19rem)]">
        {patchFiles.map((file) => <button key={`${file.old_path}:${file.new_path}`} type="button" className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left font-mono text-[10px] ${selectedFile === file.path ? "bg-muted font-medium" : "hover:bg-muted/60"}`} onClick={() => setSelectedFile(file.path)} title={file.path}><FileCode2 className="size-3 shrink-0 text-muted-foreground" /><span className="truncate">{file.path}</span></button>)}
      </div>
    </aside>
    <section className="min-w-0">
      <div className="flex h-9 items-center border-b px-3 text-xs font-semibold"><span className="truncate font-mono">{selectedFile || t("Unified diff")}</span></div>
      <DiffView patch={patchFiles.find((file) => file.path === selectedFile)?.patch ?? ""} />
    </section>
  </Card>
}

function Metric({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) { return <Card className="gap-1 rounded-md px-3 py-2.5 shadow-none"><div className={`font-mono text-xl font-semibold ${tone}`}>{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></Card> }
function Loading() { return <main className="min-h-[calc(100dvh-2.75rem)] space-y-4 bg-background p-4"><Skeleton className="h-10" /><Skeleton className="h-24" /><Skeleton className="h-16" /><Skeleton className="h-[32rem]" /></main> }
function ErrorPage({ message }: { message: string }) { const { t } = useI18n(); return <main className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center bg-background p-6"><Alert variant="destructive" className="max-w-lg"><AlertTitle>{t("Unable to load commit")}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert></main> }
