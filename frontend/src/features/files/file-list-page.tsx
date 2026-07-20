import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Flame, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AppNav } from "@/components/app-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OverviewFilterBar } from "@/features/overview/overview-filters"
import { filesQueryOptions } from "@/lib/queries"
import { filtersFromSearch, searchFromFilters, type OverviewRouteSearch } from "@/lib/url-filters"

const number = new Intl.NumberFormat()

export function FileListPage({ mode, search }: { mode: "hotspots" | "ownership"; search: OverviewRouteSearch }) {
  const filters = filtersFromSearch(search)
  const navigate = useNavigate()
  const query = useQuery({ ...filesQueryOptions(mode, filters), placeholderData: keepPreviousData })
  const report = query.data
  if (!report && query.isPending) return <Loading />
  if (!report) return <main className="flex min-h-screen items-center justify-center bg-background p-6"><Alert variant="destructive"><AlertTitle>Unable to load {mode}</AlertTitle><AlertDescription>{query.error instanceof Error ? query.error.message : "Unknown error"}</AlertDescription></Alert></main>
  const { files, repository, recent_days } = report.data
  const isHotspot = mode === "hotspots"
  return <div className="flex min-h-screen flex-col bg-background">
    {query.isFetching && <Progress value={35} className="fixed inset-x-0 top-0 z-50 h-0.5 rounded-none" />}
    <header className="sticky top-0 z-40 flex h-11 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur">
      <div className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground">{isHotspot ? <Flame className="size-3.5" /> : <ShieldCheck className="size-3.5" />}</div>
      <div className="min-w-0"><div className="truncate text-xs font-semibold">{repository.name}</div><div className="text-[10px] text-muted-foreground">File-level {mode}</div></div>
      <AppNav search={search} />
      <Button variant="ghost" size="xs" className="ml-auto" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />Refresh</Button>
    </header>
    <main className="flex-1 space-y-4 p-4 pb-10">
      <div><h1 className="text-base font-semibold">{isHotspot ? "File hotspots" : "File ownership"}</h1><p className="text-[11px] text-muted-foreground">{isHotspot ? "Change frequency and churn with direct evidence" : `Historical and recent (${recent_days}d) knowledge concentration`}</p></div>
      <OverviewFilterBar value={filters} loading={query.isFetching} onApply={(next) => void navigate({ to: isHotspot ? "/hotspots" : "/ownership", search: searchFromFilters(next) })} />
      {report.warnings.map((warning) => <Alert key={warning.code}><TriangleAlert className="text-warning" /><AlertTitle>Data quality warning</AlertTitle><AlertDescription>{warning.message}</AlertDescription></Alert>)}
      <Card className="overflow-hidden rounded-md py-0 shadow-none">
        <div className="flex items-center border-b px-3 py-2"><h2 className="text-xs font-semibold">Ranked files</h2><Badge variant="secondary" className="ml-auto">{files.length}</Badge></div>
        {files.length === 0 ? <div className="p-12 text-center text-xs text-muted-foreground">No files match the current filters.</div> : <Table>
          <TableHeader><TableRow><TableHead>Path</TableHead>{isHotspot ? <><TableHead className="text-right">Score</TableHead><TableHead className="text-right">Commits</TableHead><TableHead className="text-right">Churn</TableHead></> : <><TableHead>Historical owner</TableHead><TableHead>Recent owner</TableHead><TableHead className="text-right">Bus factor 80%</TableHead><TableHead className="text-right">Risk</TableHead></>}</TableRow></TableHeader>
          <TableBody>{files.map((file) => <TableRow key={file.path}>
            <TableCell className="max-w-[32rem]"><Link to="/file" search={{ ...search, file: file.path }} className="block truncate font-mono text-[10px] hover:underline">{file.path}</Link><div className="text-[9px] text-muted-foreground">{file.contributors} contributors · {formatDate(file.last_changed)}</div></TableCell>
            {isHotspot ? <><NumberCell>{file.hotspot_score.toFixed(1)}</NumberCell><NumberCell>{file.commits}</NumberCell><NumberCell>{number.format(file.churn)}</NumberCell></> : <><OwnerCell name={file.historical_owner.name} share={file.historical_share} /><OwnerCell name={file.recent_owner.name || "—"} share={file.recent_share} /><NumberCell>{file.bus_factor_80}</NumberCell><NumberCell>{file.ownership_risk.toFixed(1)}%</NumberCell></>}
          </TableRow>)}</TableBody>
        </Table>}
      </Card>
    </main>
    <footer className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center gap-2 border-t bg-card/95 px-3 text-[10px] text-muted-foreground"><span className="text-success">● Ready</span><span>·</span><span>{report.analysis_context.timezone}</span><span className="ml-auto">schema {report.schema_version}</span></footer>
  </div>
}

function NumberCell({ children }: { children: React.ReactNode }) { return <TableCell className="text-right font-mono tabular-nums">{children}</TableCell> }
function OwnerCell({ name, share }: { name: string; share: number }) { return <TableCell className="max-w-40"><div className="truncate text-xs">{name}</div><div className="text-[9px] text-muted-foreground">{(share * 100).toFixed(1)}%</div></TableCell> }
function Loading() { return <main className="min-h-screen space-y-4 bg-background p-4"><Skeleton className="h-10" /><Skeleton className="h-16" /><Skeleton className="h-[32rem]" /></main> }
function formatDate(value: string) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—" }
