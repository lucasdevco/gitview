import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, GitCommitHorizontal, RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { commitQueryOptions } from "@/lib/queries"
import { useI18n } from "@/lib/i18n"
import type { OverviewRouteSearch } from "@/lib/url-filters"

export function CommitPage({ commitId, search }: { commitId: string; search: OverviewRouteSearch }) {
  const { t, formatDate, formatNumber } = useI18n()
  const query = useQuery(commitQueryOptions(commitId))
  const report = query.data
  if (!report && query.isPending) return <Loading />
  if (!report) return <ErrorPage message={query.error instanceof Error ? query.error.message : t("Unable to load commit")} />
  const { repository, commit } = report.data
  return <div className="flex min-h-screen flex-col bg-background">
    {query.isFetching && <Progress value={35} className="fixed inset-x-0 top-0 z-50 h-0.5 rounded-none" />}
    <header className="sticky top-0 z-40 flex h-11 items-center gap-2 border-b bg-card/95 px-4 backdrop-blur">
      <Button variant="ghost" size="icon-xs" asChild><Link to="/" search={search} aria-label={t("Back to overview")} title={t("Back to overview")}><ArrowLeft /></Link></Button>
      <GitCommitHorizontal className="size-4 text-muted-foreground" />
      <div className="min-w-0"><div className="truncate text-xs font-semibold">{commit.subject || commit.oid.slice(0, 8)}</div><div className="truncate font-mono text-[9px] text-muted-foreground">{repository.name} · {commit.oid}</div></div>
      <div className="ml-auto" /><LanguageSwitcher /><Button variant="ghost" size="xs" className="w-[4.5rem] shrink-0" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />{t("Refresh")}</Button>
    </header>
    <main className="flex-1 space-y-4 p-4 pb-10">
      <div><h1 className="text-base font-semibold">{t("Commit review")}</h1><p className="text-[11px] text-muted-foreground">{t("Code changes introduced by this commit")}</p></div>
      <Card className="gap-3 rounded-md p-3 shadow-none">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="font-mono">{commit.oid.slice(0, 12)}</Badge><span className="text-sm font-semibold">{commit.subject}</span></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground"><span>{commit.author} &lt;{commit.author_email}&gt;</span><span>{formatDate(commit.authored_at)}</span>{commit.parent_oid && <span>{t("Parent")}: <span className="font-mono">{commit.parent_oid.slice(0, 12)}</span></span>}</div>
      </Card>
      <section className="grid grid-cols-3 gap-2">
        <Metric label={t("Files changed")} value={formatNumber(commit.files)} />
        <Metric label={t("Additions")} value={`+${formatNumber(commit.additions)}`} tone="text-success" />
        <Metric label={t("Deletions")} value={`−${formatNumber(commit.deletions)}`} tone="text-destructive" />
      </section>
      <Card className="gap-0 overflow-hidden rounded-md py-0 shadow-none">
        <div className="border-b px-3 py-2 text-xs font-semibold">{t("Unified diff")}</div>
        {commit.patch ? <DiffView patch={commit.patch} /> : <div className="p-12 text-center text-xs text-muted-foreground">{t("No textual changes in this commit.")}</div>}
      </Card>
    </main>
    <footer className="fixed inset-x-0 bottom-0 z-40 flex h-6 items-center gap-2 border-t bg-card/95 px-3 text-[10px] text-muted-foreground"><span className="text-success">● {t("Ready")}</span><span>·</span><span className="font-mono">{commit.oid.slice(0, 12)}</span><span className="ml-auto">{t("schema")} {report.schema_version}</span></footer>
  </div>
}

function DiffView({ patch }: { patch: string }) {
  return <div className="max-h-[calc(100vh-19rem)] overflow-auto bg-muted/20 font-mono text-[11px] leading-5">
    <pre className="min-w-max py-2">{parseDiffLines(patch).map((line, index) => <div key={index} className={lineClass(line.text)}><span className="inline-block w-10 select-none border-r pr-2 text-right text-muted-foreground/60">{line.oldLine ?? ""}</span><span className="mr-3 inline-block w-10 select-none border-r pr-2 text-right text-muted-foreground/60">{line.newLine ?? ""}</span><span className="pr-4">{line.text || " "}</span></div>)}</pre>
  </div>
}

function parseDiffLines(patch: string) {
  let oldLine: number | undefined
  let newLine: number | undefined
  return patch.split("\n").map((text) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      return { text }
    }
    if (oldLine === undefined || newLine === undefined || text.startsWith("\\")) return { text }
    if (text.startsWith("+") && !text.startsWith("+++")) return { text, newLine: newLine++ }
    if (text.startsWith("-") && !text.startsWith("---")) return { text, oldLine: oldLine++ }
    if (text.startsWith(" ")) return { text, oldLine: oldLine++, newLine: newLine++ }
    return { text }
  })
}

function lineClass(line: string) {
  if (line.startsWith("diff --git ")) return "bg-primary/10 font-semibold text-primary"
  if (line.startsWith("@@")) return "bg-chart-3/10 text-chart-3"
  if (line.startsWith("+") && !line.startsWith("+++")) return "bg-success/10 text-success"
  if (line.startsWith("-") && !line.startsWith("---")) return "bg-destructive/10 text-destructive"
  return "text-foreground"
}

function Metric({ label, value, tone = "text-foreground" }: { label: string; value: string; tone?: string }) { return <Card className="gap-1 rounded-md px-3 py-2.5 shadow-none"><div className={`font-mono text-xl font-semibold ${tone}`}>{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></Card> }
function Loading() { return <main className="min-h-screen space-y-4 bg-background p-4"><Skeleton className="h-10" /><Skeleton className="h-24" /><Skeleton className="h-16" /><Skeleton className="h-[32rem]" /></main> }
function ErrorPage({ message }: { message: string }) { const { t } = useI18n(); return <main className="flex min-h-screen items-center justify-center bg-background p-6"><Alert variant="destructive" className="max-w-lg"><AlertTitle>{t("Unable to load commit")}</AlertTitle><AlertDescription>{message}</AlertDescription></Alert></main> }
