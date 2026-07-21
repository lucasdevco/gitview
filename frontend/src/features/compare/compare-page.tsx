import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { GitCompareArrows, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { PageHeader } from "@/components/page-header"
import { ReportWarnings } from "@/components/report-warnings"
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
import { useI18n } from "@/lib/i18n"

export function ComparePage({ search }: { search: CompareRouteSearch }) {
  const { t } = useI18n()
  const filters = filtersFromSearch(search); const from = search.from ?? ""; const to = search.to ?? ""
  const [draftFrom, setDraftFrom] = useState(from); const [draftTo, setDraftTo] = useState(to)
  useEffect(() => { setDraftFrom(from); setDraftTo(to) }, [from, to])
  const navigate = useNavigate({ from: "/compare" })
  const query = useQuery({ ...compareQueryOptions(from, to, filters), placeholderData: keepPreviousData })
  const report = query.data
  const applyRefs = () => { if (draftFrom.trim() && draftTo.trim()) void navigate({ search: { ...search, from: draftFrom.trim(), to: draftTo.trim() } }) }
  return <div className="flex min-h-[calc(100dvh-2.75rem)] flex-col bg-background">
    {query.isFetching && <Progress value={35} className="fixed inset-x-0 top-11 z-[105] h-0.5 rounded-none" />}
    <PageHeader
      context={<><GitCompareArrows className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><div className="truncate text-xs font-semibold">{report?.data.repository.name ?? t("Revision comparison")}</div><div className="truncate text-[10px] text-muted-foreground">{t("Git revision range")}</div></div></>}
      actions={<Button variant="ghost" size="xs" className="w-[4.5rem]" disabled={!report || query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />{t("Refresh")}</Button>}
    />
    <main className="flex-1 space-y-4 p-4 pb-10">
      <div><h1 className="text-base font-semibold">{t("Compare revisions")}</h1><p className="text-[11px] text-muted-foreground">{t("Commits reachable from “to” but not “from”, with file and contributor evidence")}</p></div>
      <Card className="grid gap-3 rounded-md p-3 shadow-none sm:grid-cols-[1fr_1fr_auto]"><div className="space-y-1"><Label htmlFor="from-ref" className="text-[10px]">{t("From revision")}</Label><Input id="from-ref" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} placeholder="v1.0.0" onKeyDown={(event) => { if (event.key === "Enter") applyRefs() }} /></div><div className="space-y-1"><Label htmlFor="to-ref" className="text-[10px]">{t("To revision")}</Label><Input id="to-ref" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} placeholder="v2.0.0" onKeyDown={(event) => { if (event.key === "Enter") applyRefs() }} /></div><Button className="self-end" disabled={!draftFrom.trim() || !draftTo.trim()} onClick={applyRefs}>{t("Compare")}</Button></Card>
      <OverviewFilterBar value={filters} loading={query.isFetching} onApply={(next) => void navigate({ search: { ...searchFromFilters(next), from: from || undefined, to: to || undefined } })} />
      {!from || !to ? <Empty message={t("Enter two Git revisions to compare.")} /> : query.isPending && !report ? <Empty message={t("Analyzing revision range…")} /> : !report ? <Alert variant="destructive"><AlertTitle>{t("Unable to compare revisions")}</AlertTitle><AlertDescription>{query.error instanceof Error ? query.error.message : t("Unknown error")}</AlertDescription></Alert> : <Results report={report} />}
    </main>{report && <footer className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center gap-2 border-t bg-card/95 px-3 text-[10px] text-muted-foreground"><span className="text-success">● {t("Ready")}</span><span>·</span><span className="font-mono">{report.data.from_revision.slice(0,8)}..{report.data.to_revision.slice(0,8)}</span><span className="ml-auto">{t("schema")} {report.schema_version}</span></footer>}
  </div>
}

function Results({ report }: { report: CompareResponse }) {
  const { t, formatNumber } = useI18n()
  const { totals, files, contributors, commits } = report.data
  return <><div className="flex items-center gap-2 text-[10px]"><Badge variant="outline" className="font-mono">{report.data.from_ref}</Badge><span>→</span><Badge variant="outline" className="font-mono">{report.data.to_ref}</Badge></div><ReportWarnings warnings={report.warnings} /><section className="grid grid-cols-2 gap-2 md:grid-cols-5"><Metric label={t("Commits")} value={totals.commits} /><Metric label={t("Contributors")} value={totals.contributors} /><Metric label={t("Additions")} value={totals.additions} /><Metric label={t("Deletions")} value={totals.deletions} /><Metric label={t("Churn")} value={totals.churn} /></section><section className="grid gap-3 lg:grid-cols-2"><Panel title={t("Changed file hotspots")} count={files.length}><Table><TableHeader><TableRow><TableHead>{t("Path")}</TableHead><TableHead className="text-right">{t("Commits")}</TableHead><TableHead className="text-right">{t("Churn")}</TableHead></TableRow></TableHeader><TableBody>{files.map((file) => <TableRow key={file.path}><TableCell className="font-mono text-[10px]">{file.path}</TableCell><NumberCell>{file.commits}</NumberCell><NumberCell>{formatNumber(file.churn)}</NumberCell></TableRow>)}</TableBody></Table></Panel><Panel title={t("Contributors")} count={contributors.length}><Table><TableHeader><TableRow><TableHead>{t("Contributor")}</TableHead><TableHead className="text-right">{t("Commits")}</TableHead><TableHead className="text-right">{t("Churn")}</TableHead></TableRow></TableHeader><TableBody>{contributors.slice(0,20).map((person) => <TableRow key={person.id}><TableCell>{person.name}</TableCell><NumberCell>{person.commits}</NumberCell><NumberCell>{formatNumber(person.churn)}</NumberCell></TableRow>)}</TableBody></Table></Panel></section><Panel title={t("Commit evidence")} count={commits.length}><Table><TableHeader><TableRow><TableHead>{t("Commit")}</TableHead><TableHead>{t("Author")}</TableHead><TableHead className="text-right">{t("Churn")}</TableHead></TableRow></TableHeader><TableBody>{commits.map((commit) => <TableRow key={commit.oid}><TableCell><div>{commit.subject}</div><div className="font-mono text-[9px] text-muted-foreground">{commit.oid.slice(0,8)}</div></TableCell><TableCell>{commit.author}</TableCell><NumberCell>{formatNumber(commit.churn)}</NumberCell></TableRow>)}</TableBody></Table></Panel></>
}

function Metric({ label, value }: { label: string; value: number }) { const { formatNumber } = useI18n(); return <Card className="gap-1 rounded-md px-3 py-2.5 shadow-none"><div className="font-mono text-xl font-semibold">{formatNumber(value)}</div><div className="text-[10px] text-muted-foreground">{label}</div></Card> }
function Panel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) { return <Card className="overflow-hidden rounded-md py-0 shadow-none"><div className="flex items-center border-b px-3 py-2"><h2 className="text-xs font-semibold">{title}</h2><Badge variant="secondary" className="ml-auto">{count}</Badge></div>{children}</Card> }
function NumberCell({ children }: { children: React.ReactNode }) { return <TableCell className="text-right font-mono tabular-nums">{children}</TableCell> }
function Empty({ message }: { message: string }) { return <Card className="p-14 text-center text-xs text-muted-foreground shadow-none">{message}</Card> }
