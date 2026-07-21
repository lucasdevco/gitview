import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Bot, RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/page-header"
import { ReportWarnings } from "@/components/report-warnings"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OverviewFilterBar } from "@/features/overview/overview-filters"
import { fileQueryOptions } from "@/lib/queries"
import { filtersFromSearch, searchFromFilters, type FileRouteSearch } from "@/lib/url-filters"
import { useI18n } from "@/lib/i18n"

export function FileDetailPage({ search }: { search: FileRouteSearch }) {
  const { t, formatDate, formatNumber } = useI18n()
  const filters = filtersFromSearch(search)
  const file = search.file ?? ""
  const navigate = useNavigate({ from: "/file" })
  const query = useQuery({ ...fileQueryOptions(file, filters), enabled: file !== "", placeholderData: keepPreviousData })
  const report = query.data

  if (!file) return <ErrorPage message={t("Choose a file from Hotspots or Ownership to inspect it.")} />
  if (!report && query.isPending) return <Loading />
  if (!report) return <ErrorPage message={query.error instanceof Error ? query.error.message : t("Unable to load file")} />

  const { repository, contributors, recent_commits, recent_days } = report.data
  const metric = report.data.file
  const listSearch = searchFromFilters(filters)
  return <div className="flex min-h-[calc(100dvh-2.75rem)] flex-col bg-background">
    {query.isFetching && <Progress value={35} className="fixed inset-x-0 top-11 z-[105] h-0.5 rounded-none" />}
    <PageHeader
      context={<><Button variant="ghost" size="icon-xs" asChild><Link to="/hotspots" search={listSearch} aria-label={t("Back to file hotspots")} title={t("Back to file hotspots")}><ArrowLeft /></Link></Button><div className="min-w-0"><div className="truncate font-mono text-[11px] font-semibold">{metric.path}</div><div className="truncate text-[10px] text-muted-foreground">{t("{repository} file evidence", { repository: repository.name })}</div></div></>}
      actions={<Button variant="ghost" size="xs" className="w-[4.5rem]" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />{t("Refresh")}</Button>}
    />
    <main className="flex-1 space-y-4 p-4 pb-10">
      <div><h1 className="text-base font-semibold">{t("File analysis")}</h1><p className="text-[11px] text-muted-foreground">{t("Change evidence and knowledge concentration for the selected history")}</p></div>
      <OverviewFilterBar value={filters} loading={query.isFetching} onApply={(next) => void navigate({ search: { ...searchFromFilters(next), file } })} />
      <ReportWarnings warnings={report.warnings} />
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        <Metric label={t("Hotspot score")} value={metric.hotspot_score.toFixed(1)} />
        <Metric label={t("Commits")} value={formatNumber(metric.commits)} />
        <Metric label={t("Churn")} value={formatNumber(metric.churn)} />
        <Metric label={t("Contributors")} value={formatNumber(metric.contributors)} />
        <Metric label={t("Bus factor 80%")} value={formatNumber(metric.bus_factor_80)} />
        <Metric label={t("Ownership risk")} value={`${metric.ownership_risk.toFixed(1)}%`} />
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <OwnershipCard title={t("Historical owner")} name={metric.historical_owner.name} share={metric.historical_share} />
        <OwnershipCard title={t("Recent owner · {days}d", { days: recent_days })} name={metric.recent_owner.name} share={metric.recent_share} />
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        <Panel title={t("Contributor evidence")} count={contributors.length}><Table><TableHeader><TableRow><TableHead>{t("Contributor")}</TableHead><TableHead className="text-right">{t("Commits")}</TableHead><TableHead className="text-right">{t("Churn")}</TableHead><TableHead className="text-right">{t("Share")}</TableHead></TableRow></TableHeader><TableBody>{contributors.map((entry) => <TableRow key={entry.contributor.id}><TableCell><Link to="/contributors/$contributorId" params={{ contributorId: entry.contributor.id }} search={listSearch} className="inline-flex items-center gap-1 hover:underline">{entry.contributor.name}{entry.contributor.is_bot && <Bot className="size-3 text-muted-foreground" />}</Link><div className="text-[9px] text-muted-foreground">{t("Last active {date}", { date: formatDate(entry.last_active) })}</div></TableCell><NumberCell>{entry.commits}</NumberCell><NumberCell>{formatNumber(entry.churn)}</NumberCell><NumberCell>{(entry.share * 100).toFixed(1)}%</NumberCell></TableRow>)}</TableBody></Table></Panel>
        <Panel title={t("Recent commit evidence")} count={recent_commits.length}><Table><TableHeader><TableRow><TableHead>{t("Commit")}</TableHead><TableHead>{t("Author")}</TableHead><TableHead className="text-right">{t("Churn")}</TableHead></TableRow></TableHeader><TableBody>{recent_commits.map((commit) => <TableRow key={commit.oid}><TableCell className="max-w-80"><div className="truncate font-medium">{commit.subject}</div><div className="font-mono text-[9px] text-muted-foreground">{commit.oid.slice(0, 8)} · {formatDate(commit.authored_at)}</div></TableCell><TableCell><Link to="/contributors/$contributorId" params={{ contributorId: commit.author_id }} search={listSearch} className="hover:underline">{commit.author}</Link></TableCell><NumberCell>{formatNumber(commit.churn)}</NumberCell></TableRow>)}</TableBody></Table></Panel>
      </section>
    </main>
    <footer className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center gap-2 border-t bg-card/95 px-3 text-[10px] text-muted-foreground"><span className="text-success">● {t("Ready")}</span><span>·</span><span>{report.analysis_context.timezone}</span><span className="ml-auto">{t("schema")} {report.schema_version}</span></footer>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) { return <Card className="gap-1 rounded-md px-3 py-2.5 shadow-none"><div className="font-mono text-xl font-semibold tabular-nums">{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></Card> }
function OwnershipCard({ title, name, share }: { title: string; name: string; share: number }) { const { t } = useI18n(); return <Card className="gap-2 rounded-md px-3 py-3 shadow-none"><div className="flex items-center"><div><div className="text-[10px] text-muted-foreground">{title}</div><div className="text-sm font-semibold">{name || t("No recent activity")}</div></div><Badge variant="secondary" className="ml-auto font-mono">{(share * 100).toFixed(1)}%</Badge></div><Progress value={share * 100} className="h-1.5" /></Card> }
function Panel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) { return <Card className="gap-2 overflow-hidden rounded-md py-0 shadow-none"><div className="flex items-center border-b px-3 py-2"><h2 className="text-xs font-semibold">{title}</h2><Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[9px]">{count}</Badge></div><ScrollArea className="h-[360px]">{children}</ScrollArea></Card> }
function NumberCell({ children }: { children: React.ReactNode }) { return <TableCell className="text-right font-mono tabular-nums">{children}</TableCell> }
function Loading() { return <main className="min-h-[calc(100dvh-2.75rem)] space-y-4 bg-background p-4"><Skeleton className="h-10" /><Skeleton className="h-16" /><Skeleton className="h-20" /><Skeleton className="h-[24rem]" /></main> }
function ErrorPage({ message }: { message: string }) { const { t } = useI18n(); return <main className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center bg-background p-6"><Alert variant="destructive" className="max-w-lg"><AlertTitle>{t("Unable to load file")}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert></main> }
