import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { GitCompareArrows, RefreshCw, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AppNav } from "@/components/app-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OverviewFilterBar } from "@/features/overview/overview-filters"
import type { CompareResponse } from "@/lib/api"
import { compareQueryOptions } from "@/lib/queries"
import { filtersFromSearch, searchFromFilters, type CompareRouteSearch } from "@/lib/url-filters"

const number = new Intl.NumberFormat()

export function ComparePage({ search }: { search: CompareRouteSearch }) {
  const filters = filtersFromSearch(search); const from = search.from ?? ""; const to = search.to ?? ""
  const [draftFrom, setDraftFrom] = useState(from); const [draftTo, setDraftTo] = useState(to)
  useEffect(() => { setDraftFrom(from); setDraftTo(to) }, [from, to])
  const navigate = useNavigate({ from: "/compare" })
  const query = useQuery({ ...compareQueryOptions(from, to, filters), placeholderData: keepPreviousData })
  const report = query.data
  const applyRefs = () => { if (draftFrom.trim() && draftTo.trim()) void navigate({ search: { ...search, from: draftFrom.trim(), to: draftTo.trim() } }) }
  return <div className="flex min-h-screen flex-col bg-background">
    {query.isFetching && <Progress value={35} className="fixed inset-x-0 top-0 z-50 h-0.5 rounded-none" />}
    <header className="sticky top-0 z-40 flex h-11 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur"><div className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground"><GitCompareArrows className="size-3.5" /></div><div className="min-w-0"><div className="truncate text-xs font-semibold">{report?.data.repository.name ?? "Revision comparison"}</div><div className="text-[10px] text-muted-foreground">Git revision range</div></div><AppNav search={searchFromFilters(filters)} /><Button variant="ghost" size="xs" className="ml-auto" disabled={!report || query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />Refresh</Button></header>
    <main className="flex-1 space-y-4 p-4 pb-10">
      <div><h1 className="text-base font-semibold">Compare revisions</h1><p className="text-[11px] text-muted-foreground">Commits reachable from “to” but not “from”, with file and contributor evidence</p></div>
      <Card className="grid gap-3 rounded-md p-3 shadow-none sm:grid-cols-[1fr_1fr_auto]"><div className="space-y-1"><Label htmlFor="from-ref" className="text-[10px]">From revision</Label><Input id="from-ref" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} placeholder="v1.0.0" onKeyDown={(event) => { if (event.key === "Enter") applyRefs() }} /></div><div className="space-y-1"><Label htmlFor="to-ref" className="text-[10px]">To revision</Label><Input id="to-ref" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} placeholder="v2.0.0" onKeyDown={(event) => { if (event.key === "Enter") applyRefs() }} /></div><Button className="self-end" disabled={!draftFrom.trim() || !draftTo.trim()} onClick={applyRefs}>Compare</Button></Card>
      <OverviewFilterBar value={filters} loading={query.isFetching} onApply={(next) => void navigate({ search: { ...searchFromFilters(next), from: from || undefined, to: to || undefined } })} />
      {!from || !to ? <Empty message="Enter two Git revisions to compare." /> : query.isPending && !report ? <Empty message="Analyzing revision range…" /> : !report ? <Alert variant="destructive"><AlertTitle>Unable to compare revisions</AlertTitle><AlertDescription>{query.error instanceof Error ? query.error.message : "Unknown error"}</AlertDescription></Alert> : <Results report={report} />}
    </main>{report && <footer className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center gap-2 border-t bg-card/95 px-3 text-[10px] text-muted-foreground"><span className="text-success">● Ready</span><span>·</span><span className="font-mono">{report.data.from_revision.slice(0,8)}..{report.data.to_revision.slice(0,8)}</span><span className="ml-auto">schema {report.schema_version}</span></footer>}
  </div>
}

function Results({ report }: { report: CompareResponse }) {
  const { totals, files, contributors, commits } = report.data
  return <><div className="flex items-center gap-2 text-[10px]"><Badge variant="outline" className="font-mono">{report.data.from_ref}</Badge><span>→</span><Badge variant="outline" className="font-mono">{report.data.to_ref}</Badge></div>{report.warnings.map((warning) => <Alert key={warning.code}><TriangleAlert className="text-warning" /><AlertTitle>Data quality warning</AlertTitle><AlertDescription>{warning.message}</AlertDescription></Alert>)}<section className="grid grid-cols-2 gap-2 md:grid-cols-5"><Metric label="Commits" value={totals.commits} /><Metric label="Contributors" value={totals.contributors} /><Metric label="Additions" value={totals.additions} /><Metric label="Deletions" value={totals.deletions} /><Metric label="Churn" value={totals.churn} /></section><section className="grid gap-3 lg:grid-cols-2"><Panel title="Changed file hotspots" count={files.length}><Table><TableHeader><TableRow><TableHead>Path</TableHead><TableHead className="text-right">Commits</TableHead><TableHead className="text-right">Churn</TableHead></TableRow></TableHeader><TableBody>{files.map((file) => <TableRow key={file.path}><TableCell className="font-mono text-[10px]">{file.path}</TableCell><NumberCell>{file.commits}</NumberCell><NumberCell>{number.format(file.churn)}</NumberCell></TableRow>)}</TableBody></Table></Panel><Panel title="Contributors" count={contributors.length}><Table><TableHeader><TableRow><TableHead>Contributor</TableHead><TableHead className="text-right">Commits</TableHead><TableHead className="text-right">Churn</TableHead></TableRow></TableHeader><TableBody>{contributors.slice(0,20).map((person) => <TableRow key={person.id}><TableCell>{person.name}</TableCell><NumberCell>{person.commits}</NumberCell><NumberCell>{number.format(person.churn)}</NumberCell></TableRow>)}</TableBody></Table></Panel></section><Panel title="Commit evidence" count={commits.length}><Table><TableHeader><TableRow><TableHead>Commit</TableHead><TableHead>Author</TableHead><TableHead className="text-right">Churn</TableHead></TableRow></TableHeader><TableBody>{commits.map((commit) => <TableRow key={commit.oid}><TableCell><div>{commit.subject}</div><div className="font-mono text-[9px] text-muted-foreground">{commit.oid.slice(0,8)}</div></TableCell><TableCell>{commit.author}</TableCell><NumberCell>{number.format(commit.churn)}</NumberCell></TableRow>)}</TableBody></Table></Panel></>
}

function Metric({ label, value }: { label: string; value: number }) { return <Card className="gap-1 rounded-md px-3 py-2.5 shadow-none"><div className="font-mono text-xl font-semibold">{number.format(value)}</div><div className="text-[10px] text-muted-foreground">{label}</div></Card> }
function Panel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) { return <Card className="overflow-hidden rounded-md py-0 shadow-none"><div className="flex items-center border-b px-3 py-2"><h2 className="text-xs font-semibold">{title}</h2><Badge variant="secondary" className="ml-auto">{count}</Badge></div>{children}</Card> }
function NumberCell({ children }: { children: React.ReactNode }) { return <TableCell className="text-right font-mono tabular-nums">{children}</TableCell> }
function Empty({ message }: { message: string }) { return <Card className="p-14 text-center text-xs text-muted-foreground shadow-none">{message}</Card> }
