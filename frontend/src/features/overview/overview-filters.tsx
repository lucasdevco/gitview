import { useEffect, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, FilterX, FolderOpen, FolderTree } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { format, parse, startOfYear, subDays } from "date-fns"
import { enUS, zhCN } from "date-fns/locale"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { OverviewFilters } from "@/lib/api"
import { emptyFilters, sameFilters } from "@/lib/url-filters"
import { useI18n } from "@/lib/i18n"
import { directoriesQueryOptions } from "@/lib/queries"

type Props = {
  value: OverviewFilters
  loading: boolean
  onApply: (filters: OverviewFilters) => void
}

const dateFormat = "yyyy-MM-dd"

export function OverviewFilterBar({ value, loading, onApply }: Props) {
  const { language, t } = useI18n()
  const [draft, setDraft] = useState(value)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [pathPickerOpen, setPathPickerOpen] = useState(false)
  const [pickerParent, setPickerParent] = useState("")
  const directories = useQuery({ ...directoriesQueryOptions(pickerParent), enabled: pathPickerOpen })

  useEffect(() => setDraft(value), [value])

  const selected: DateRange | undefined = draft.since || draft.until ? {
    from: draft.since ? parse(draft.since, dateFormat, new Date()) : undefined,
    to: draft.until ? parse(draft.until, dateFormat, new Date()) : undefined,
  } : undefined

  const applyPreset = (preset: "all" | "30d" | "90d" | "year") => {
    const today = new Date()
    if (preset === "all") {
      setDraft((current) => ({ ...current, since: "", until: "" }))
      setCalendarOpen(false)
      return
    }
    const since = preset === "year" ? startOfYear(today) : subDays(today, preset === "30d" ? 29 : 89)
    setDraft((current) => ({ ...current, since: format(since, dateFormat), until: format(today, dateFormat) }))
    setCalendarOpen(false)
  }

  const rangeLabel = draft.since || draft.until
    ? `${draft.since || "…"} → ${draft.until || "…"}`
    : t("All history")
  const hasDateFilter = Boolean(draft.since || draft.until)
  const hasPathFilter = Boolean(draft.path)
  const hasChanges = !sameFilters(draft, value)

  return (
    <form
      className="grid w-full gap-2 rounded-lg border bg-card/80 p-2 shadow-xs backdrop-blur sm:w-fit sm:max-w-full sm:grid-cols-[15rem_minmax(18rem,22rem)_auto] sm:items-end"
      onSubmit={(event) => { event.preventDefault(); onApply(draft) }}
      data-testid="overview-filters"
    >
      <div className="grid min-w-0 gap-1">
        <Label className="flex h-3.5 items-center px-0.5 text-[9px] font-medium tracking-wide text-muted-foreground">{t("Author date")}</Label>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="group h-9 w-full justify-start gap-2 rounded-md bg-background px-2.5 text-xs font-normal shadow-none hover:border-primary/40 hover:bg-background">
              <span className="relative flex size-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
                <CalendarDays className="size-3.5" />
                {hasDateFilter && <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary ring-2 ring-background" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{rangeLabel}</span>
              <ChevronRight className="size-3 text-muted-foreground/70 transition-transform group-data-[state=open]:rotate-90" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto overflow-hidden rounded-lg p-0 shadow-lg">
            <div className="flex gap-1 bg-muted/40 p-2">
              {(["all", "30d", "90d", "year"] as const).map((preset) => (
                <Button key={preset} type="button" size="xs" variant={preset === "all" ? !hasDateFilter ? "secondary" : "ghost" : "ghost"} className="flex-1" onClick={() => applyPreset(preset)}>
                  {t(({ all: "All", "30d": "30 days", "90d": "90 days", year: "This year" } as const)[preset])}
                </Button>
              ))}
            </div>
            <Calendar
              locale={language === "zh-CN" ? zhCN : enUS}
              mode="range"
              selected={selected}
              onSelect={(range) => {
                setDraft((current) => ({
                  ...current,
                  since: range?.from ? format(range.from, dateFormat) : "",
                  until: range?.to ? format(range.to, dateFormat) : "",
                }))
                if (range?.from && range.to) setCalendarOpen(false)
              }}
              defaultMonth={selected?.from}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid min-w-0 gap-1">
        <Label htmlFor="path-filter" className="flex h-3.5 items-center px-0.5 text-[9px] font-medium tracking-wide text-muted-foreground">{t("Repository path")}</Label>
        <div className="flex overflow-hidden rounded-md border bg-background transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-primary/40">
          <div className="relative min-w-0 flex-1 border-r">
            <span className="pointer-events-none absolute left-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded bg-muted text-muted-foreground">
              <FolderTree className="size-3.5" />
              {hasPathFilter && <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-primary ring-2 ring-background" />}
            </span>
            <Input
              id="path-filter"
              value={draft.path}
              onChange={(event) => setDraft((current) => ({ ...current, path: event.target.value }))}
              placeholder={t("e.g. internal/parser")}
              className="h-9 rounded-none border-0 bg-transparent pl-9 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
              autoComplete="off"
            />
          </div>
          <Popover open={pathPickerOpen} onOpenChange={(open) => { setPathPickerOpen(open); if (open) setPickerParent("") }}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" className="h-9 w-9 shrink-0 rounded-none text-muted-foreground hover:text-foreground" aria-label={t("Choose repository path")} title={t("Choose repository path")}>
                <FolderOpen className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 overflow-hidden rounded-lg p-0 shadow-lg">
              <div className="flex items-center gap-1 border-b bg-muted/40 p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={!pickerParent}
                  aria-label={t("Back to parent folder")}
                  title={t("Back to parent folder")}
                  onClick={() => setPickerParent(pickerParent.split("/").slice(0, -1).join("/"))}
                >
                  <ChevronLeft />
                </Button>
                <div className="min-w-0 flex-1 truncate px-1 font-mono text-[10px]" title={pickerParent || t("Repository root")}>
                  {pickerParent || t("Repository root")}
                </div>
                <Button
                  type="button"
                  size="xs"
                  onClick={() => { setDraft((current) => ({ ...current, path: pickerParent })); setPathPickerOpen(false) }}
                >
                  {t("Use this folder")}
                </Button>
              </div>
              <div className="max-h-56 overflow-y-auto p-1.5">
                {directories.isPending ? <div className="px-2 py-8 text-center text-xs text-muted-foreground">{t("Loading folders…")}</div>
                  : directories.isError ? <div className="px-2 py-8 text-center text-xs text-destructive">{t("Unable to load folders")}</div>
                  : directories.data.data.directories.length === 0 ? <div className="px-2 py-8 text-center text-xs text-muted-foreground">{t("No subfolders")}</div>
                  : directories.data.data.directories.map((directory) => {
                    const name = directory.split("/").at(-1) ?? directory
                    return <Button key={directory} type="button" variant="ghost" className="h-8 w-full justify-start rounded-md px-2 font-mono text-xs" onClick={() => setPickerParent(directory)} title={`${t("Open folder")}: ${directory}`}>
                      <span className="flex size-5 items-center justify-center rounded bg-muted"><FolderTree className="size-3 text-muted-foreground" /></span>
                      <span className="min-w-0 flex-1 truncate text-left">{name}</span>
                      <ChevronRight className="text-muted-foreground" />
                    </Button>
                  })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex h-9 items-center gap-1 sm:ml-0.5">
        <Button type="submit" size="sm" className="h-9 flex-1 px-4 shadow-xs sm:flex-none" disabled={loading || !hasChanges}>{t("Apply")}</Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-9 px-2.5 text-muted-foreground hover:text-destructive"
          disabled={loading || sameFilters(value, emptyFilters)}
          onClick={() => { setDraft(emptyFilters); onApply(emptyFilters) }}
          aria-label={t("Clear filters")}
          title={t("Clear filters")}
        >
          <FilterX className="size-3.5" /><span className="sm:hidden">{t("Clear")}</span>
        </Button>
      </div>
    </form>
  )
}
