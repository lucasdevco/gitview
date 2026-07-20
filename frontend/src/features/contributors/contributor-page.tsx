import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Bot, RefreshCw, TriangleAlert } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OverviewFilterBar } from "@/features/overview/overview-filters"
import { contributorQueryOptions } from "@/lib/queries"
import { filtersFromSearch, searchFromFilters, type OverviewRouteSearch } from "@/lib/url-filters"

const number = new Intl.NumberFormat()
const chartConfig = {
  commits: { label: "Commits", color: "var(--chart-1)" },
  churn: { label: "Churn", color: "var(--chart-2)" },
} satisfies ChartConfig

export function ContributorPage({ contributorId, search }: { contributorId: string; search: OverviewRouteSearch }) {
  const filters = filtersFromSearch(search)
  const navigate = useNavigate({ from: "/contributors/$contributorId" })
  const query = useQuery({ ...contributorQueryOptions(contributorId, filters), placeholderData: keepPreviousData })
  const report = query.data

  if (!report && query.isPending) return <ContributorLoading />
  if (!report) return <main className="flex min-h-screen items-center justify-center bg-background p-6"><Alert variant="destructive" className="max-w-lg"><AlertTitle>Unable to load contributor</AlertTitle><AlertDescription>{query.error instanceof Error ? query.error.message : "Unknown error"}</AlertDescription></Alert></main>

  const { contributor, monthly_activity, top_paths, recent_commits, repository } = report.data
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 flex h-11 items-center gap-2 border-b bg-card/95 px-4 backdrop-blur">
        <Button variant="ghost" size="icon-xs" asChild><Link to="/" search={search} aria-label="Back to overview" title="Back to overview"><ArrowLeft /></Link></Button>
        <div className="min-w-0"><div className="truncate text-xs font-semibold">{contributor.name}</div><div className="truncate text-[10px] text-muted-foreground">{repository.name} contributor detail</div></div>
        {contributor.is_bot && <Badge variant="outline" className="gap-1"><Bot className="size-3" />bot</Badge>}
        <Button variant="ghost" size="xs" className="ml-auto" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />Refresh</Button>
      </header>
      <main className="flex-1 space-y-4 p-4 pb-10">
        <div><h1 className="text-base font-semibold tracking-tight">Contributor activity</h1><p className="text-[11px] text-muted-foreground">Author-time activity, paths, and supporting commits</p></div>
        <OverviewFilterBar value={filters} loading={query.isFetching} onApply={(next) => void navigate({ search: searchFromFilters(next) })} />
        {report.warnings.map((warning) => <Alert key={warning.code}><TriangleAlert className="text-warning" /><AlertTitle>Data quality warning</AlertTitle><AlertDescription>{warning.message}</AlertDescription></Alert>)}
        <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label="Commits" value={contributor.commits} />
          <Metric label="Additions" value={contributor.additions} tone="text-success" prefix="+" />
          <Metric label="Deletions" value={contributor.deletions} tone="text-destructive" prefix="−" />
          <Metric label="Churn" value={contributor.churn} />
        </section>
        <Card className="gap-3 rounded-md py-3 shadow-none"><CardHeader className="px-3"><CardTitle className="text-xs">Monthly activity</CardTitle></CardHeader><CardContent className="px-2"><ChartContainer config={chartConfig} className="h-[210px] w-full aspect-auto"><BarChart data={monthly_activity}><CartesianGrid vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis yAxisId="commits" width={28} tickLine={false} axisLine={false} /><YAxis yAxisId="churn" orientation="right" width={42} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar yAxisId="commits" dataKey="commits" fill="var(--color-commits)" /><Bar yAxisId="churn" dataKey="churn" fill="var(--color-churn)" /></BarChart></ChartContainer></CardContent></Card>
        <section className="grid gap-3 lg:grid-cols-2">
          <Panel title="Top paths" count={top_paths.length}><Table><TableHeader><TableRow><TableHead>Path</TableHead><TableHead className="text-right">Commits</TableHead><TableHead className="text-right">Churn</TableHead></TableRow></TableHeader><TableBody>{top_paths.map((path) => <TableRow key={path.path}><TableCell className="max-w-80 truncate font-mono text-[10px]">{path.path}</TableCell><TableCell className="text-right font-mono">{path.commits}</TableCell><TableCell className="text-right font-mono">{number.format(path.churn)}</TableCell></TableRow>)}</TableBody></Table></Panel>
          <Panel title="Recent commits" count={recent_commits.length}><Table><TableHeader><TableRow><TableHead>Commit</TableHead><TableHead className="text-right">Churn</TableHead></TableRow></TableHeader><TableBody>{recent_commits.map((commit) => <TableRow key={commit.oid}><TableCell className="max-w-96"><div className="truncate font-medium">{commit.subject}</div><div className="font-mono text-[9px] text-muted-foreground">{commit.oid.slice(0, 8)} · {formatDate(commit.authored_at)}</div></TableCell><TableCell className="text-right font-mono">{number.format(commit.churn)}</TableCell></TableRow>)}</TableBody></Table></Panel>
        </section>
      </main>
      <footer className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center gap-2 border-t bg-card/95 px-3 text-[10px] text-muted-foreground"><span className="text-success">● Ready</span><span>·</span><span>{report.analysis_context.timezone}</span><span className="ml-auto font-mono">schema {report.schema_version}</span></footer>
    </div>
  )
}

function Metric({ label, value, tone = "text-foreground", prefix = "" }: { label: string; value: number; tone?: string; prefix?: string }) { return <Card className="gap-1 rounded-md px-3 py-2.5 shadow-none"><div className={`font-mono text-xl font-semibold ${tone}`}>{prefix}{number.format(value)}</div><div className="text-[10px] text-muted-foreground">{label}</div></Card> }
function Panel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) { return <Card className="gap-2 overflow-hidden rounded-md py-0 shadow-none"><div className="flex items-center border-b px-3 py-2"><h2 className="text-xs font-semibold">{title}</h2><Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[9px]">{count}</Badge></div><ScrollArea className="h-[330px]">{children}</ScrollArea></Card> }
function ContributorLoading() { return <main className="min-h-screen space-y-4 bg-background p-4"><Skeleton className="h-10" /><Skeleton className="h-20" /><Skeleton className="h-56" /><Skeleton className="h-80" /></main> }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) }
