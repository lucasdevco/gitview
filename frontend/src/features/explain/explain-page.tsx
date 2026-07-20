import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { CalendarSearch, RefreshCw, TriangleAlert } from "lucide-react"
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
import type { ExplainResponse } from "@/lib/api"
import { explainQueryOptions } from "@/lib/queries"
import type { ExplainRouteSearch } from "@/lib/url-filters"

const number = new Intl.NumberFormat()

export function ExplainPage({ search }: { search: ExplainRouteSearch }) {
  const month = search.month ?? ""; const path = search.path ?? ""
  const [draftMonth, setDraftMonth] = useState(month); const [draftPath, setDraftPath] = useState(path)
  useEffect(() => { setDraftMonth(month); setDraftPath(path) }, [month, path])
  const navigate = useNavigate({ from: "/explain" })
  const query = useQuery({ ...explainQueryOptions(month, path), placeholderData: keepPreviousData })
  const report = query.data
  const apply = () => { if (draftMonth) void navigate({ search: { month: draftMonth, path: draftPath.trim() || undefined } }) }
  return <div className="flex min-h-screen flex-col bg-background">
    {query.isFetching && <Progress value={35} className="fixed inset-x-0 top-0 z-50 h-0.5 rounded-none" />}
    <header className="sticky top-0 z-40 flex h-11 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur"><div className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground"><CalendarSearch className="size-3.5" /></div><div className="min-w-0"><div className="truncate text-xs font-semibold">{report?.data.repository.name ?? "Monthly explanation"}</div><div className="text-[10px] text-muted-foreground">Evidence-backed month review</div></div><AppNav search={{ path: path || undefined }} /><Button variant="ghost" size="xs" className="ml-auto" disabled={!report || query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />Refresh</Button></header>
    <main className="flex-1 space-y-4 p-4 pb-10"><div><h1 className="text-base font-semibold">Explain a month</h1><p className="text-[11px] text-muted-foreground">A structured summary backed by contributors, paths, and commits</p></div><Card className="grid gap-3 rounded-md p-3 shadow-none sm:grid-cols-[14rem_1fr_auto]"><div className="space-y-1"><Label htmlFor="explain-month" className="text-[10px]">Calendar month</Label><Input id="explain-month" type="month" value={draftMonth} onChange={(event) => setDraftMonth(event.target.value)} /></div><div className="space-y-1"><Label htmlFor="explain-path" className="text-[10px]">Repository path · optional</Label><Input id="explain-path" value={draftPath} placeholder="internal/parser" onChange={(event) => setDraftPath(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") apply() }} /></div><Button className="self-end" disabled={!draftMonth} onClick={apply}>Explain</Button></Card>{!month ? <Empty message="Select a calendar month to explain." /> : query.isPending && !report ? <Empty message="Building monthly evidence…" /> : !report ? <Alert variant="destructive"><AlertTitle>Unable to explain month</AlertTitle><AlertDescription>{query.error instanceof Error ? query.error.message : "Unknown error"}</AlertDescription></Alert> : <Results report={report} />}</main>
    {report && <footer className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center gap-2 border-t bg-card/95 px-3 text-[10px] text-muted-foreground"><span className="text-success">● Ready</span><span>·</span><span>{report.data.month}</span><span className="ml-auto">schema {report.schema_version}</span></footer>}
  </div>
}

function Results({ report }: { report: ExplainResponse }) { const { totals, insights, paths, contributors, commits } = report.data; return <>{report.warnings.map((warning) => <Alert key={warning.code}><TriangleAlert className="text-warning" /><AlertTitle>Data quality warning</AlertTitle><AlertDescription>{warning.message}</AlertDescription></Alert>)}<section className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">{insights.map((insight) => <Card key={insight.kind} className="gap-1.5 rounded-md p-3 shadow-none"><Badge variant="outline" className="w-fit">{insight.kind}</Badge><h2 className="text-xs font-semibold">{insight.title}</h2><p className="text-[11px] leading-relaxed text-muted-foreground">{insight.summary}</p></Card>)}</section><section className="grid grid-cols-2 gap-2 md:grid-cols-5"><Metric label="Commits" value={totals.commits} /><Metric label="Contributors" value={totals.contributors} /><Metric label="Additions" value={totals.additions} /><Metric label="Deletions" value={totals.deletions} /><Metric label="Churn" value={totals.churn} /></section><section className="grid gap-3 lg:grid-cols-3"><Panel title="Most changed paths" count={paths.length}><Table><TableHeader><TableRow><TableHead>Path</TableHead><TableHead className="text-right">Churn</TableHead></TableRow></TableHeader><TableBody>{paths.map((entry) => <TableRow key={entry.path}><TableCell className="max-w-60 truncate font-mono text-[10px]">{entry.path}</TableCell><NumberCell>{number.format(entry.churn)}</NumberCell></TableRow>)}</TableBody></Table></Panel><Panel title="Leading contributors" count={contributors.length}><Table><TableHeader><TableRow><TableHead>Contributor</TableHead><TableHead className="text-right">Commits</TableHead></TableRow></TableHeader><TableBody>{contributors.map((entry) => <TableRow key={entry.id}><TableCell>{entry.name}</TableCell><NumberCell>{entry.commits}</NumberCell></TableRow>)}</TableBody></Table></Panel><Panel title="Recent commit evidence" count={commits.length}><Table><TableHeader><TableRow><TableHead>Commit</TableHead><TableHead className="text-right">Churn</TableHead></TableRow></TableHeader><TableBody>{commits.map((commit) => <TableRow key={commit.oid}><TableCell className="max-w-72"><div className="truncate">{commit.subject}</div><div className="font-mono text-[9px] text-muted-foreground">{commit.oid.slice(0,8)}</div></TableCell><NumberCell>{number.format(commit.churn)}</NumberCell></TableRow>)}</TableBody></Table></Panel></section></> }
function Metric({ label, value }: { label: string; value: number }) { return <Card className="gap-1 rounded-md px-3 py-2.5 shadow-none"><div className="font-mono text-xl font-semibold">{number.format(value)}</div><div className="text-[10px] text-muted-foreground">{label}</div></Card> }
function Panel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) { return <Card className="overflow-hidden rounded-md py-0 shadow-none"><div className="flex items-center border-b px-3 py-2"><h2 className="text-xs font-semibold">{title}</h2><Badge variant="secondary" className="ml-auto">{count}</Badge></div>{children}</Card> }
function NumberCell({ children }: { children: React.ReactNode }) { return <TableCell className="text-right font-mono tabular-nums">{children}</TableCell> }
function Empty({ message }: { message: string }) { return <Card className="p-14 text-center text-xs text-muted-foreground shadow-none">{message}</Card> }
