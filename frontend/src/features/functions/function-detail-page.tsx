import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OverviewFilterBar } from "@/features/overview/overview-filters"
import { functionQueryOptions } from "@/lib/queries"
import { filtersFromSearch, searchFromFilters, type OverviewRouteSearch } from "@/lib/url-filters"
import { useI18n } from "@/lib/i18n"

export function FunctionDetailPage({ functionId, search }: { functionId: string; search: OverviewRouteSearch }) {
  const { t, formatDate, formatNumber } = useI18n()
  const filters = filtersFromSearch(search)
  const navigate = useNavigate({ from: "/functions/$functionId" })
  const query = useQuery({ ...functionQueryOptions(functionId, filters), placeholderData: keepPreviousData })
  const report = query.data
  if (!report && query.isPending) return <Loading />
  if (!report) return <ErrorPage message={query.error instanceof Error ? query.error.message : t("Unable to load function history")} />
  const { repository, history, analyzer_version } = report.data
  const fn = report.data.function
  return <div className="flex min-h-[calc(100dvh-2.75rem)] flex-col bg-background">
    {query.isFetching && <Progress value={35} className="fixed inset-x-0 top-11 z-[105] h-0.5 rounded-none" />}
    <PageHeader
      context={<><Button variant="ghost" size="icon-xs" asChild><Link to="/functions" search={search} aria-label={t("Back to function hotspots")} title={t("Back to function hotspots")}><ArrowLeft /></Link></Button><div className="min-w-0"><div className="truncate font-mono text-[11px] font-semibold">{fn.qualified_name}</div><div className="truncate text-[10px] text-muted-foreground">{repository.name} · {fn.path}:{fn.start_line}–{fn.end_line}</div></div><Badge variant="outline" className="shrink-0">{fn.lineage_confidence}</Badge></>}
      actions={<Button variant="ghost" size="xs" className="w-[4.5rem]" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />{t("Refresh")}</Button>}
    />
    <main className="flex-1 space-y-4 p-4 pb-10">
      <div><h1 className="text-base font-semibold">{t("Function history")}</h1><p className="font-mono text-[10px] text-muted-foreground">{fn.signature}</p></div>
      <OverviewFilterBar value={filters} loading={query.isFetching} onApply={(next) => void navigate({ search: searchFromFilters(next) })} />
      {report.warnings.map((warning) => <Alert key={warning.code}><TriangleAlert className="text-warning" /><AlertTitle>{t("Analysis warning")}</AlertTitle><AlertDescription>{warning.message}</AlertDescription></Alert>)}
      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7"><Metric label={t("Hotspot")} value={fn.hotspot_score.toFixed(1)} /><Metric label={t("Changes")} value={formatNumber(fn.changes)} /><Metric label={t("Churn")} value={formatNumber(fn.churn)} /><Metric label={t("Complexity")} value={formatNumber(fn.complexity)} /><Metric label={t("Lines")} value={formatNumber(fn.lines)} /><Metric label={t("Owner")} value={fn.owner.name || "—"} compact /><Metric label={t("Owner share")} value={`${(fn.owner_share * 100).toFixed(1)}%`} /></section>
      <Card className="overflow-hidden rounded-md py-0 shadow-none"><div className="flex items-center border-b px-3 py-2"><h2 className="text-xs font-semibold">{t("Attributed commits")}</h2><Badge variant="secondary" className="ml-auto">{history.length}</Badge></div>{history.length === 0 ? <div className="p-12 text-center text-xs text-muted-foreground">{t("No history hunks overlap this function in the selected window.")}</div> : <Table><TableHeader><TableRow><TableHead>{t("Commit")}</TableHead><TableHead>{t("Author")}</TableHead><TableHead className="text-right">{t("Additions")}</TableHead><TableHead className="text-right">{t("Deletions")}</TableHead><TableHead className="text-right">{t("Churn")}</TableHead><TableHead>{t("Confidence")}</TableHead></TableRow></TableHeader><TableBody>{history.map((change) => <TableRow key={change.oid}><TableCell className="max-w-[34rem]"><div className="truncate font-medium">{change.subject}</div><div className="font-mono text-[9px] text-muted-foreground">{change.oid.slice(0,8)} · {formatDate(change.authored_at)}</div></TableCell><TableCell><Link to="/contributors/$contributorId" params={{ contributorId: change.author_id }} search={search} className="hover:underline">{change.author}</Link></TableCell><NumberCell tone="text-success">+{formatNumber(change.additions)}</NumberCell><NumberCell tone="text-destructive">−{formatNumber(change.deletions)}</NumberCell><NumberCell>{formatNumber(change.churn)}</NumberCell><TableCell><Badge variant="outline">{change.confidence}</Badge></TableCell></TableRow>)}</TableBody></Table>}</Card>
    </main><footer className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center gap-2 border-t bg-card/95 px-3 text-[10px] text-muted-foreground"><span className="text-success">● {t("Ready")}</span><span>·</span><span>{analyzer_version}</span><span className="ml-auto">{t("schema")} {report.schema_version}</span></footer>
  </div>
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) { return <Card className="min-w-0 gap-1 rounded-md px-3 py-2.5 shadow-none"><div className={`${compact ? "truncate text-sm" : "font-mono text-xl"} font-semibold tabular-nums`}>{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></Card> }
function NumberCell({ children, tone = "" }: { children: React.ReactNode; tone?: string }) { return <TableCell className={`text-right font-mono tabular-nums ${tone}`}>{children}</TableCell> }
function Loading() { return <main className="min-h-[calc(100dvh-2.75rem)] space-y-4 bg-background p-4"><Skeleton className="h-10" /><Skeleton className="h-16" /><Skeleton className="h-20" /><Skeleton className="h-[30rem]" /></main> }
function ErrorPage({ message }: { message: string }) { const { t } = useI18n(); return <main className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center bg-background p-6"><Alert variant="destructive" className="max-w-lg"><AlertTitle>{t("Unable to load function history")}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert></main> }
