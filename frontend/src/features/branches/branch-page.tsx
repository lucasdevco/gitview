import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { ExternalLink, FileCode2, GitBranch, GitCommitHorizontal, RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AppNav } from "@/components/app-nav"
import { LanguageSwitcher } from "@/components/language-switcher"
import { RepositoryContext } from "@/components/repository-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { DiffView, diffFiles } from "@/features/commits/diff-view"
import type { BranchCommit } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { branchesQueryOptions, commitQueryOptions } from "@/lib/queries"

export type BranchRouteSearch = { branch?: string }

const workingTreeID = "__working_tree__"
const graphColors = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777"]

export function BranchPage({ search }: { search: BranchRouteSearch }) {
  const { t, locale } = useI18n()
  const navigate = useNavigate({ from: "/branches" })
  const branch = search.branch ?? ""
  const query = useQuery(branchesQueryOptions(branch))
  const [showRemote, setShowRemote] = useState(true)
  const [selected, setSelected] = useState("")
  const [selectedFile, setSelectedFile] = useState("")
  const report = query.data
  const review = useQuery({ ...commitQueryOptions(selected || "HEAD"), enabled: selected !== "" && selected !== workingTreeID })

  useEffect(() => {
    if (!report) return
    const valid = selected === workingTreeID ? report.data.working_tree.dirty : report.data.commits.some((commit) => commit.oid === selected)
    if (!valid) setSelected(report.data.working_tree.dirty ? workingTreeID : (report.data.commits[0]?.oid ?? ""))
  }, [report, selected])

  const patch = selected === workingTreeID ? (report?.data.working_tree.patch ?? "") : (review.data?.data.commit.patch ?? "")
  const files = selected === workingTreeID ? (report?.data.working_tree.files ?? []) : diffFiles(patch)
  useEffect(() => setSelectedFile(files[0] ?? ""), [selected, patch])

  const graph = useMemo(() => layoutGraph(report?.data.commits ?? []), [report?.data.commits])
  if (!report && query.isPending) return <Loading />
  if (!report) return <ErrorPage message={query.error instanceof Error ? query.error.message : t("Unable to load branch history")} />

  const { repository, branches, commits, working_tree } = report.data
  const visibleBranches = branches.filter((item) => showRemote || !item.remote)
  const remoteNames = new Set(branches.filter((item) => item.remote).map((item) => item.name))
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" })

  return <div className="flex h-screen min-h-[36rem] flex-col overflow-hidden bg-background">
    {query.isFetching && <Progress value={35} className="fixed inset-x-0 top-0 z-50 h-0.5 rounded-none" />}
    <header className="flex h-11 shrink-0 items-center gap-3 border-b bg-card/95 px-4">
      <RepositoryContext repository={repository} />
      <AppNav search={{ since: "", until: "", path: "" }} />
      <div className="ml-auto" /><LanguageSwitcher />
      <Button variant="ghost" size="xs" className="w-[4.5rem] shrink-0" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />{t("Refresh")}</Button>
    </header>

    <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-muted/20 px-3 text-xs">
      <select className="h-7 min-w-44 rounded border bg-background px-2 text-xs" value={branch} onChange={(event) => void navigate({ search: { branch: event.target.value || undefined } })}>
        <option value="">{t("All branches")}</option>
        {visibleBranches.map((item) => <option key={item.full_name} value={item.name}>{item.current ? "● " : ""}{item.name}</option>)}
      </select>
      <label className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground"><input type="checkbox" checked={showRemote} onChange={(event) => setShowRemote(event.target.checked)} />{t("Show remote branches")}</label>
      <span className="ml-2 text-muted-foreground">{t("Sort by date")}</span>
      <span className="ml-auto font-mono text-[10px] text-muted-foreground">{commits.length} {t("Commits")}</span>
    </div>

    <main className="flex min-h-0 flex-1 flex-col">
      <section className="flex min-h-0 flex-[3] flex-col border-b">
        <div className="flex h-7 shrink-0 items-center border-b bg-muted/25 text-[10px] font-medium text-muted-foreground">
          <div className="w-28 shrink-0 border-r px-3">{t("Graph")}</div><div className="min-w-0 flex-1 border-r px-3">{t("Description")}</div><div className="w-52 shrink-0 border-r px-3">{t("Author")}</div><div className="w-24 shrink-0 border-r px-3">{t("Commit")}</div><div className="w-36 shrink-0 px-3">{t("Date")}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {working_tree.dirty && <LogRow selected={selected === workingTreeID} onClick={() => setSelected(workingTreeID)} graph={<WorkingNode />} description={<span className="font-semibold">{t("Uncommitted changes")}</span>} author="*" oid="*" authoredAt={new Date().toISOString()} date={date} />}
          {graph.map(({ commit, lane, lanes }) => {
            const refs = commit.refs.filter((name) => showRemote || !remoteNames.has(name))
            return <LogRow key={commit.oid} selected={selected === commit.oid} onClick={() => setSelected(commit.oid)} graph={<GraphNode lane={lane} lanes={lanes} />} description={<div className="flex min-w-0 items-center gap-1.5"><div className="flex shrink-0 gap-1">{refs.map((ref) => <Badge key={ref} variant="outline" className="h-5 max-w-36 truncate px-1.5 text-[9px]"><GitBranch className="size-2.5" />{ref}</Badge>)}</div><span className="truncate">{commit.subject || t("No subject")}</span></div>} author={commit.author} oid={commit.oid.slice(0, 7)} authoredAt={commit.authored_at} date={date} />
          })}
          {commits.length === 0 && !working_tree.dirty && <div className="p-12 text-center text-xs text-muted-foreground">{t("No commits yet")}</div>}
        </div>
      </section>

      <section className="flex min-h-48 flex-[2] bg-card/30">
        <aside className="flex w-72 shrink-0 flex-col border-r">
          <div className="flex h-8 shrink-0 items-center border-b px-3 text-[10px] font-semibold">{t("Changed files")}<Badge variant="secondary" className="ml-auto h-5">{files.length}</Badge></div>
          <div className="min-h-0 flex-1 overflow-auto p-1.5">{files.map((file) => <button key={file} className={`flex h-7 w-full items-center gap-2 rounded px-2 text-left font-mono text-[10px] ${selectedFile === file ? "bg-muted font-medium" : "hover:bg-muted/60"}`} onClick={() => setSelectedFile(file)}><FileCode2 className="size-3 shrink-0 text-muted-foreground" /><span className="truncate">{file}</span></button>)}</div>
          {selected !== workingTreeID && selected && <Button variant="ghost" size="xs" className="m-2 justify-start" asChild><Link to="/commits/$commitId" params={{ commitId: selected }} search={{ since: "", until: "", path: "" }}><ExternalLink />{t("Open full review")}</Link></Button>}
        </aside>
        <div className="min-w-0 flex-1 overflow-hidden">
          {!selected ? <EmptyPreview text={t("Select a commit to preview its changes.")} />
            : review.isPending && selected !== workingTreeID ? <div className="space-y-2 p-3"><Skeleton className="h-5 w-48" /><Skeleton className="h-64 w-full" /></div>
              : patch ? <DiffView patch={patch} file={selectedFile} className="h-full" />
                : <EmptyPreview text={t("No diff available")} />}
        </div>
      </section>
    </main>
  </div>
}

function LogRow({ selected, onClick, graph, description, author, oid, authoredAt, date }: { selected: boolean; onClick: () => void; graph: React.ReactNode; description: React.ReactNode; author: string; oid: string; authoredAt: string; date: Intl.DateTimeFormat }) {
  return <button type="button" onClick={onClick} className={`flex h-9 w-full items-center border-b text-left text-[11px] ${selected ? "bg-muted" : "hover:bg-muted/45"}`}>
    <div className="relative h-full w-28 shrink-0 border-r">{graph}</div><div className="min-w-0 flex-1 border-r px-3">{description}</div><div className="w-52 shrink-0 truncate border-r px-3 text-muted-foreground">{author}</div><div className="w-24 shrink-0 border-r px-3 font-mono text-muted-foreground">{oid}</div><time className="w-36 shrink-0 px-3 text-muted-foreground" dateTime={authoredAt}>{date.format(new Date(authoredAt))}</time>
  </button>
}

function WorkingNode() { return <div className="absolute left-5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-muted-foreground bg-background" /> }
function GraphNode({ lane, lanes }: { lane: number; lanes: number }) {
  return <>{Array.from({ length: Math.min(lanes, graphColors.length) }, (_, index) => <span key={index} className="absolute inset-y-0 w-0.5" style={{ left: 20 + index * 14, background: graphColors[index] }} />)}<span className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 bg-background" style={{ left: 15 + Math.min(lane, graphColors.length - 1) * 14, borderColor: graphColors[lane % graphColors.length] }} /></>
}

function layoutGraph(commits: BranchCommit[]) {
  const active: string[] = []
  return commits.map((commit) => {
    let lane = active.indexOf(commit.oid)
    if (lane < 0) { lane = active.length; active.push(commit.oid) }
    const lanes = Math.max(active.length, lane + 1)
    if (commit.parents[0]) active[lane] = commit.parents[0]
    else active.splice(lane, 1)
    for (const parent of commit.parents.slice(1)) if (!active.includes(parent)) active.splice(lane + 1, 0, parent)
    for (let index = active.length - 1; index >= 0; index--) if (active.indexOf(active[index]) !== index) active.splice(index, 1)
    return { commit, lane, lanes }
  })
}

function EmptyPreview({ text }: { text: string }) { return <div className="flex h-full items-center justify-center text-xs text-muted-foreground"><GitCommitHorizontal className="mr-2 size-4" />{text}</div> }
function Loading() { return <main className="min-h-screen space-y-3 bg-background p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-80" /><Skeleton className="h-60" /></main> }
function ErrorPage({ message }: { message: string }) { const { t } = useI18n(); return <main className="flex min-h-screen items-center justify-center bg-background p-6"><Alert variant="destructive" className="max-w-lg"><AlertTitle>{t("Unable to load branch history")}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert></main> }
