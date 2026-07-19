import { useCallback, useEffect, useState } from "react"
import { AlertCircle, GitBranch, GitCommitHorizontal, RefreshCw, TriangleAlert } from "lucide-react"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fetchOverview, type OverviewResponse } from "@/lib/api"

const number = new Intl.NumberFormat()
const chartConfig = {
  commits: { label: "Commits", color: "var(--chart-1)" },
  churn: { label: "Churn", color: "var(--chart-2)" },
} satisfies ChartConfig

export function App() {
  const [report, setReport] = useState<OverviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      setReport(await fetchOverview(signal))
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return
      setError(reason instanceof Error ? reason.message : "Unable to load repository overview")
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (!report && loading) return <LoadingShell />
  if (!report && error) return <FatalError message={error} retry={() => void load()} />
  if (!report) return null

  const { repository, totals, monthly_activity, contributors, recent_commits } = report.data
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {loading && <Progress value={35} className="fixed inset-x-0 top-0 z-50 h-0.5 rounded-none" />}
      <header className="sticky top-0 z-40 flex h-11 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur">
        <div className="flex size-6 items-center justify-center rounded bg-primary font-mono text-[10px] font-bold text-primary-foreground">GV</div>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{repository.name}</div>
          <Tooltip><TooltipTrigger asChild><div className="max-w-[44vw] truncate text-[10px] text-muted-foreground">{repository.root}</div></TooltipTrigger><TooltipContent>{repository.root}</TooltipContent></Tooltip>
        </div>
        <Badge variant="outline" className="ml-1 gap-1 font-mono text-[10px]"><GitBranch className="size-3" />{repository.branch || "detached"}</Badge>
        <Badge variant="secondary" className="hidden font-mono text-[10px] sm:inline-flex">{repository.head.slice(0, 8) || "empty"}</Badge>
        <Button variant="ghost" size="xs" className="ml-auto" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh</Button>
      </header>

      <main className={`flex-1 space-y-4 p-4 pb-10 transition-opacity ${loading ? "opacity-85" : ""}`}>
        <div className="flex items-end justify-between">
          <div><h1 className="text-base font-semibold tracking-tight">Repository overview</h1><p className="text-[11px] text-muted-foreground">Contribution activity across reachable HEAD history</p></div>
          <span className="hidden text-[10px] text-muted-foreground sm:block">Updated {formatDate(report.analysis_context.generated_at)}</span>
        </div>

        {error && <Alert variant="destructive"><AlertCircle /><AlertTitle>Refresh failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {report.warnings.map((warning) => <Alert key={warning.code}><TriangleAlert className="text-warning" /><AlertTitle>Data quality warning</AlertTitle><AlertDescription>{warning.message}</AlertDescription></Alert>)}

        <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <MetricCard label="Commits" value={totals.commits} />
          <MetricCard label="Contributors" value={totals.contributors} />
          <MetricCard label="Additions" value={totals.additions} tone="text-success" prefix="+" />
          <MetricCard label="Deletions" value={totals.deletions} tone="text-destructive" prefix="−" />
          <MetricCard label="Churn" value={totals.churn} />
        </section>

        {repository.empty ? <EmptyRepository /> : <>
          <Card className="gap-3 rounded-md py-3 shadow-none">
            <CardHeader className="px-3"><CardTitle className="text-xs">Monthly activity</CardTitle></CardHeader>
            <CardContent className="px-2">
              <ChartContainer config={chartConfig} className="h-[220px] w-full aspect-auto">
                <BarChart data={monthly_activity} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis yAxisId="commits" width={28} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis yAxisId="churn" orientation="right" width={42} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar yAxisId="commits" dataKey="commits" fill="var(--color-commits)" radius={[2, 2, 0, 0]} />
                  <Bar yAxisId="churn" dataKey="churn" fill="var(--color-churn)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <section className="grid gap-3 lg:grid-cols-2">
            <DataPanel title="Contributors" count={contributors.length}>
              <Table><TableHeader><TableRow><TableHead>Person</TableHead><TableHead className="text-right">Commits</TableHead><TableHead className="text-right">Churn</TableHead><TableHead className="text-right">Last active</TableHead></TableRow></TableHeader>
                <TableBody>{contributors.map((person) => <TableRow key={`${person.name}-${person.last_active}`}><TableCell className="max-w-48 truncate font-medium">{person.name}</TableCell><NumericCell>{person.commits}</NumericCell><NumericCell>{number.format(person.churn)}</NumericCell><TableCell className="text-right text-[10px] text-muted-foreground">{formatDate(person.last_active)}</TableCell></TableRow>)}</TableBody>
              </Table>
            </DataPanel>
            <DataPanel title="Recent commits" count={recent_commits.length}>
              <Table><TableHeader><TableRow><TableHead>Commit</TableHead><TableHead>Author</TableHead><TableHead className="text-right">Churn</TableHead></TableRow></TableHeader>
                <TableBody>{recent_commits.map((commit) => <TableRow key={commit.oid}><TableCell className="max-w-[22rem]"><div className="truncate font-medium">{commit.subject || "(no subject)"}</div><div className="font-mono text-[9px] text-muted-foreground">{commit.oid.slice(0, 8)} · {formatDate(commit.authored_at)}</div></TableCell><TableCell className="max-w-28 truncate text-muted-foreground">{commit.author}</TableCell><NumericCell>{number.format(commit.churn)}</NumericCell></TableRow>)}</TableBody>
              </Table>
            </DataPanel>
          </section>
        </>}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center gap-2 border-t bg-card/95 px-3 text-[10px] text-muted-foreground backdrop-blur">
        <span className="flex items-center gap-1 text-success"><span className="size-1.5 rounded-full bg-success" />Ready</span><span>·</span><span>{totals.commits} commits</span><span>·</span><span>{report.analysis_context.timezone}</span><span className="ml-auto hidden font-mono sm:inline">schema {report.schema_version}</span>
      </footer>
    </div>
  )
}
function MetricCard({ label, value, tone = "text-foreground", prefix = "" }: { label: string; value: number; tone?: string; prefix?: string }) {
  return <Card className="gap-1 rounded-md px-3 py-2.5 shadow-none"><div className={`font-mono text-xl font-semibold tabular-nums ${tone}`}>{prefix}{number.format(value)}</div><div className="text-[10px] font-medium text-muted-foreground">{label}</div></Card>
}

function DataPanel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <Card className="gap-2 overflow-hidden rounded-md py-0 shadow-none"><div className="flex items-center border-b px-3 py-2"><h2 className="text-xs font-semibold">{title}</h2><Badge variant="secondary" className="ml-auto h-4 rounded-sm px-1.5 text-[9px]">{count}</Badge></div><ScrollArea className="h-[330px]">{children}</ScrollArea></Card>
}

function NumericCell({ children }: { children: React.ReactNode }) { return <TableCell className="text-right font-mono tabular-nums">{children}</TableCell> }
function formatDate(value: string) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—" }

function EmptyRepository() {
  return <Card className="items-center gap-2 rounded-md py-16 text-center shadow-none"><GitCommitHorizontal className="size-8 text-muted-foreground" /><CardTitle className="text-sm">No commits yet</CardTitle><p className="text-xs text-muted-foreground">Create the first commit, then refresh this page.</p></Card>
}

function LoadingShell() {
  return <div className="min-h-screen bg-background"><div className="h-11 border-b bg-card" /><main className="space-y-4 p-4"><Skeleton className="h-8 w-52" /><div className="grid grid-cols-2 gap-2 md:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div><Skeleton className="h-64" /><div className="grid gap-3 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div></main></div>
}

function FatalError({ message, retry }: { message: string; retry: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><Alert variant="destructive" className="max-w-lg"><AlertCircle /><AlertTitle>Unable to analyze repository</AlertTitle><AlertDescription className="space-y-3"><p>{message}</p><Button size="sm" variant="outline" onClick={retry}>Retry</Button></AlertDescription></Alert></main>
}
