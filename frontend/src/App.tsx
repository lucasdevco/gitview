import { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { AlertCircle, FilterX, GitCommitHorizontal, RefreshCw } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { ReportWarnings } from "@/components/report-warnings"
import { RepositoryContext } from "@/components/repository-context"
import { OverviewFilterBar } from "@/features/overview/overview-filters"
import type { Contributor, Month, OverviewFilters } from "@/lib/api"
import { overviewQueryOptions } from "@/lib/queries"
import { filtersFromSearch, searchFromFilters } from "@/lib/url-filters"
import { useI18n } from "@/lib/i18n"

export function App() {
  const { t, formatDate, formatNumber } = useI18n()
  const search = useSearch({ from: "/" })
  const navigate = useNavigate({ from: "/" })
  const filters = filtersFromSearch(search)
  const query = useQuery({ ...overviewQueryOptions(filters), placeholderData: keepPreviousData })
  const report = query.data
  const error = query.error instanceof Error ? query.error.message : query.error ? t("Unable to load repository overview") : null
  const loading = query.isFetching

  const applyFilters = (next: OverviewFilters) => {
    void navigate({ search: searchFromFilters(next) })
  }

  if (!report && query.isPending) return <LoadingShell />
  if (!report && error) return <FatalError message={error} retry={() => void query.refetch()} />
  if (!report) return null

  const { repository, totals, monthly_activity, contributors, recent_commits } = report.data
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)] flex-col bg-background">
      {loading && <Progress value={35} className="fixed inset-x-0 top-11 z-[105] h-0.5 rounded-none" />}
      <PageHeader
        context={<RepositoryContext repository={repository} />}
        actions={<Button variant="ghost" size="xs" className="w-[4.5rem]" onClick={() => void query.refetch()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />{t("Refresh")}</Button>}
      />

      <main className={`flex-1 space-y-4 p-4 pb-10 transition-opacity ${loading ? "opacity-85" : ""}`}>
        <div className="flex items-end justify-between">
          <div><h1 className="text-base font-semibold tracking-tight">{t("Repository overview")}</h1><p className="text-[11px] text-muted-foreground">{t("Contribution activity across reachable HEAD history")}</p></div>
          <span className="hidden text-[10px] text-muted-foreground sm:block">{t("Updated {date}", { date: formatDate(report.analysis_context.generated_at) })}</span>
        </div>

        <OverviewFilterBar value={filters} loading={loading} onApply={applyFilters} />

        {error && <Alert variant="destructive"><AlertCircle /><AlertTitle>{t("Refresh failed")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <ReportWarnings warnings={report.warnings} />

        <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <MetricCard label={t("Commits")} value={totals.commits} />
          <MetricCard label={t("Contributors")} value={totals.contributors} />
          <MetricCard label={t("Additions")} value={totals.additions} tone="text-success" prefix="+" />
          <MetricCard label={t("Deletions")} value={totals.deletions} tone="text-destructive" prefix="−" />
          <MetricCard label={t("Churn")} value={totals.churn} />
        </section>

        {repository.empty ? <EmptyRepository /> : totals.commits === 0 ? <NoMatchingHistory /> : <>
          <MonthlyContributorChart months={monthly_activity} contributors={contributors} />

          <section className="grid gap-3 lg:grid-cols-2">
            <DataPanel title={t("Contributors")} count={contributors.length}>
              <Table><TableHeader><TableRow><TableHead>{t("Person")}</TableHead><TableHead className="text-right">{t("Commits")}</TableHead><TableHead className="text-right">{t("Churn")}</TableHead><TableHead className="text-right">{t("Last active")}</TableHead></TableRow></TableHeader>
                <TableBody>{contributors.map((person) => <TableRow key={person.id}><TableCell className="max-w-48"><div className="flex min-w-0 items-center gap-1"><Link to="/contributors/$contributorId" params={{ contributorId: person.id }} search={searchFromFilters(filters)} className="truncate font-medium hover:underline">{person.name}</Link>{person.is_bot && <Badge variant="outline" className="h-4 shrink-0 px-1 text-[8px]">{t("bot")}</Badge>}</div></TableCell><NumericCell>{person.commits}</NumericCell><NumericCell>{formatNumber(person.churn)}</NumericCell><TableCell sortValue={Date.parse(person.last_active)} className="text-right text-[10px] text-muted-foreground">{formatDate(person.last_active)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </DataPanel>
            <DataPanel title={t("Recent commits")} count={recent_commits.length}>
              <Table><TableHeader><TableRow><TableHead>{t("Commit")}</TableHead><TableHead>{t("Author")}</TableHead><TableHead className="text-right">{t("Churn")}</TableHead></TableRow></TableHeader>
                <TableBody>{recent_commits.map((commit) => <TableRow key={commit.oid}><TableCell className="max-w-[22rem]"><Link to="/commits/$commitId" params={{ commitId: commit.oid }} search={searchFromFilters(filters)} className="block truncate font-medium hover:underline" title={t("Review commit")}>{commit.subject || t("No subject")}</Link><div className="font-mono text-[9px] text-muted-foreground">{commit.oid.slice(0, 8)} · {formatDate(commit.authored_at)}</div></TableCell><TableCell className="max-w-28 truncate text-muted-foreground">{commit.author}</TableCell><NumericCell>{formatNumber(commit.churn)}</NumericCell></TableRow>)}</TableBody>
              </Table>
            </DataPanel>
          </section>
        </>}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center gap-2 border-t bg-card/95 px-3 text-[10px] text-muted-foreground backdrop-blur">
        <span className="flex items-center gap-1 text-success"><span className="size-1.5 rounded-full bg-success" />{t("Ready")}</span><span>·</span><span>{t("{count} commits", { count: totals.commits })}</span><span>·</span><span>{report.analysis_context.timezone}</span><span className="ml-auto hidden font-mono sm:inline">{t("schema")} {report.schema_version}</span>
      </footer>
    </div>
  )
}

const CONTRIBUTOR_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)",
  "oklch(0.62 0.16 210)", "oklch(0.66 0.17 340)", "oklch(0.64 0.13 115)",
]

function MonthlyContributorChart({ months, contributors }: { months: Month[]; contributors: Contributor[] }) {
  const { t } = useI18n()
  const [metric, setMetric] = useState<"commits" | "churn">("commits")
  const chart = useMemo(() => {
    const visible = [...contributors]
      .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name))
      .slice(0, CONTRIBUTOR_COLORS.length)
    const visibleIDs = new Set(visible.map((person) => person.id))
    const hasOther = contributors.length > visible.length
    const series = visible.map((person, index) => ({ id: person.id, name: person.name, color: CONTRIBUTOR_COLORS[index] }))
    if (hasOther) series.push({ id: "other", name: t("Other contributors"), color: "var(--muted-foreground)" })
    const data = months.map((month) => {
      const row: Record<string, string | number> = { month: month.month }
      for (const person of month.contributors) {
        const key = visibleIDs.has(person.id) ? person.id : "other"
        row[key] = Number(row[key] ?? 0) + person[metric]
      }
      return row
    })
    const config = Object.fromEntries(series.map((item) => [item.id, { label: item.name, color: item.color }])) satisfies ChartConfig
    return { data, series, config, hasOther }
  }, [contributors, metric, months, t])

  return <Card className="gap-3 rounded-md py-3 shadow-none">
    <CardHeader className="flex-row items-center gap-3 px-3">
      <div className="min-w-0">
        <CardTitle className="text-xs">{t("Monthly activity by contributor")}</CardTitle>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{chart.hasOther ? t("Showing the top 8 contributors; the rest are grouped as Other.") : t("Each color represents a contributor.")}</p>
      </div>
      <div className="ml-auto flex rounded-md border bg-muted/40 p-0.5" role="group" aria-label={t("Activity metric")}>
        <Button type="button" size="xs" variant={metric === "commits" ? "secondary" : "ghost"} aria-pressed={metric === "commits"} onClick={() => setMetric("commits")}>{t("Commits")}</Button>
        <Button type="button" size="xs" variant={metric === "churn" ? "secondary" : "ghost"} aria-pressed={metric === "churn"} onClick={() => setMetric("churn")}>{t("Churn")}</Button>
      </div>
    </CardHeader>
    <CardContent className="px-2">
      <ChartContainer config={chart.config} className="h-[240px] w-full aspect-auto">
        <BarChart data={chart.data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis width={42} tickLine={false} axisLine={false} allowDecimals={metric !== "commits"} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {chart.series.map((item, index) => <Bar key={item.id} dataKey={item.id} stackId="contributors" fill={`var(--color-${item.id})`} radius={index === chart.series.length - 1 ? [2, 2, 0, 0] : 0} />)}
        </BarChart>
      </ChartContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 px-2">
        {chart.series.map((item) => <span key={item.id} className="flex max-w-40 items-center gap-1 text-[10px] text-muted-foreground"><span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} /><span className="truncate" title={item.name}>{item.name}</span></span>)}
      </div>
    </CardContent>
  </Card>
}
function MetricCard({ label, value, tone = "text-foreground", prefix = "" }: { label: string; value: number; tone?: string; prefix?: string }) {
  const { formatNumber } = useI18n()
  return <Card className="gap-1 rounded-md px-3 py-2.5 shadow-none"><div className={`font-mono text-xl font-semibold tabular-nums ${tone}`}>{prefix}{formatNumber(value)}</div><div className="text-[10px] font-medium text-muted-foreground">{label}</div></Card>
}

function DataPanel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <Card className="gap-2 overflow-hidden rounded-md py-0 shadow-none"><div className="flex items-center border-b px-3 py-2"><h2 className="text-xs font-semibold">{title}</h2><Badge variant="secondary" className="ml-auto h-4 rounded-sm px-1.5 text-[9px]">{count}</Badge></div><ScrollArea className="h-[330px]">{children}</ScrollArea></Card>
}

function NumericCell({ children }: { children: React.ReactNode }) { return <TableCell className="text-right font-mono tabular-nums">{children}</TableCell> }
function EmptyRepository() {
  const { t } = useI18n()
  return <Card className="items-center gap-2 rounded-md py-16 text-center shadow-none"><GitCommitHorizontal className="size-8 text-muted-foreground" /><CardTitle className="text-sm">{t("No commits yet")}</CardTitle><p className="text-xs text-muted-foreground">{t("Create the first commit, then refresh this page.")}</p></Card>
}

function NoMatchingHistory() {
  const { t } = useI18n()
  return <Card className="items-center gap-2 rounded-md py-16 text-center shadow-none"><FilterX className="size-8 text-muted-foreground" /><CardTitle className="text-sm">{t("No matching history")}</CardTitle><p className="text-xs text-muted-foreground">{t("Adjust or clear the current date and path filters.")}</p></Card>
}

function LoadingShell() {
  return <div className="min-h-[calc(100dvh-2.75rem)] bg-background"><main className="space-y-4 p-4"><Skeleton className="h-8 w-52" /><div className="grid grid-cols-2 gap-2 md:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div><Skeleton className="h-64" /><div className="grid gap-3 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div></main></div>
}

function FatalError({ message, retry }: { message: string; retry: () => void }) {
  const { t } = useI18n()
  return <main className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center bg-background p-6"><Alert variant="destructive" className="max-w-lg"><AlertCircle /><AlertTitle>{t("Unable to analyze repository")}</AlertTitle><AlertDescription className="space-y-3"><p>{message}</p><Button size="sm" variant="outline" onClick={retry}>{t("Retry")}</Button></AlertDescription></Alert></main>
}
