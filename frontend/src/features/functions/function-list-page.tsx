import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Braces, RefreshCw, TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AppNav } from "@/components/app-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OverviewFilterBar } from "@/features/overview/overview-filters"
import { functionsQueryOptions } from "@/lib/queries"
import { filtersFromSearch, searchFromFilters, type FunctionRouteSearch } from "@/lib/url-filters"

const number = new Intl.NumberFormat()
const sorts = ["hotspot", "churn", "changes", "complexity"] as const

export function FunctionListPage({ search }: { search: FunctionRouteSearch }) {
  const filters = filtersFromSearch(search)
  const sort = search.sort ?? "hotspot"
  const navigate = useNavigate({ from: "/functions" })
  const query = useQuery({ ...functionsQueryOptions(sort, filters), placeholderData: keepPreviousData })
  const report = query.data
  if (!report && query.isPending) return <Loading />
  if (!report) return <ErrorPage message={query.error instanceof Error ? query.error.message : "Unable to load functions"} />
  const { repository, functions, analyzer_version } = report.data
  return <div className="flex min-h-screen flex-col bg-background">
    {query.isFetching && <Progress value={35} className="fixed inset-x-0 top-0 z-50 h-0.5 rounded-none" />}
    <header className="sticky top-0 z-40 flex h-11 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur"><div className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground"><Braces className="size-3.5" /></div><div className="min-w-0"><div className="truncate text-xs font-semibold">{repository.name}</div><div className="text-[10px] text-muted-foreground">Go function analysis</div></div><AppNav search={search} /><Button variant="ghost" size="xs" className="ml-auto" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />Refresh</Button></header>
    <main className="flex-1 space-y-4 p-4 pb-10">
      <div><h1 className="text-base font-semibold">Function hotspots</h1><p className="text-[11px] text-muted-foreground">Current Go AST symbols with explainable history attribution</p></div>
      <OverviewFilterBar value={filters} loading={query.isFetching} onApply={(next) => void navigate({ search: { ...searchFromFilters(next), sort: sort === "hotspot" ? undefined : sort } })} />
      <div className="flex items-center gap-1"><span className="mr-1 text-[10px] text-muted-foreground">Sort by</span>{sorts.map((value) => <Button key={value} size="xs" variant={sort === value ? "secondary" : "ghost"} onClick={() => void navigate({ search: { ...search, sort: value === "hotspot" ? undefined : value } })}>{value}</Button>)}</div>
      {report.warnings.map((warning) => <Alert key={warning.code}><TriangleAlert className="text-warning" /><AlertTitle>Analysis warning</AlertTitle><AlertDescription>{warning.message}</AlertDescription></Alert>)}
      <Card className="overflow-hidden rounded-md py-0 shadow-none"><div className="flex items-center border-b px-3 py-2"><h2 className="text-xs font-semibold">Ranked Go functions</h2><Badge variant="secondary" className="ml-auto">{functions.length}</Badge></div>{functions.length === 0 ? <div className="p-12 text-center text-xs text-muted-foreground">No Go functions match the current filters.</div> : <Table><TableHeader><TableRow><TableHead>Function</TableHead><TableHead>Owner</TableHead><TableHead className="text-right">Hotspot</TableHead><TableHead className="text-right">Changes</TableHead><TableHead className="text-right">Churn</TableHead><TableHead className="text-right">Complexity</TableHead></TableRow></TableHeader><TableBody>{functions.map((fn) => <TableRow key={fn.id}><TableCell className="max-w-[32rem]"><Link to="/functions/$functionId" params={{ functionId: fn.id }} search={searchFromFilters(filters)} className="block truncate font-mono text-[11px] font-medium hover:underline">{fn.qualified_name}</Link><div className="truncate font-mono text-[9px] text-muted-foreground">{fn.path}:{fn.start_line}–{fn.end_line} · {fn.lines} lines</div></TableCell><TableCell className="max-w-40"><div className="truncate text-xs">{fn.owner.name || "—"}</div><div className="text-[9px] text-muted-foreground">{(fn.owner_share * 100).toFixed(1)}%</div></TableCell><NumberCell>{fn.hotspot_score.toFixed(1)}</NumberCell><NumberCell>{fn.changes}</NumberCell><NumberCell>{number.format(fn.churn)}</NumberCell><NumberCell>{fn.complexity}</NumberCell></TableRow>)}</TableBody></Table>}</Card>
    </main><footer className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center gap-2 border-t bg-card/95 px-3 text-[10px] text-muted-foreground"><span className="text-success">● Ready</span><span>·</span><span>{analyzer_version}</span><span className="ml-auto">schema {report.schema_version}</span></footer>
  </div>
}

function NumberCell({ children }: { children: React.ReactNode }) { return <TableCell className="text-right font-mono tabular-nums">{children}</TableCell> }
function Loading() { return <main className="min-h-screen space-y-4 bg-background p-4"><Skeleton className="h-10" /><Skeleton className="h-16" /><Skeleton className="h-20" /><Skeleton className="h-[32rem]" /></main> }
function ErrorPage({ message }: { message: string }) { return <main className="flex min-h-screen items-center justify-center bg-background p-6"><Alert variant="destructive" className="max-w-lg"><AlertTitle>Unable to load functions</AlertTitle><AlertDescription>{message}</AlertDescription></Alert></main> }
