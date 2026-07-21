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

  return (
    <form
      className="flex flex-col gap-2 rounded-md border bg-card p-2 sm:flex-row sm:items-end"
      onSubmit={(event) => { event.preventDefault(); onApply(draft) }}
      data-testid="overview-filters"
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <Label className="text-[10px] text-muted-foreground">{t("Author date")}</Label>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="h-8 justify-start px-2 text-xs font-normal">
              <CalendarDays className="size-3.5 text-muted-foreground" />
              <span className="truncate">{rangeLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <div className="flex gap-1 border-b p-2">
              {(["all", "30d", "90d", "year"] as const).map((preset) => (
                <Button key={preset} type="button" size="xs" variant="ghost" onClick={() => applyPreset(preset)}>
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

      <div className="grid min-w-0 flex-[1.4] gap-1">
        <Label htmlFor="path-filter" className="text-[10px] text-muted-foreground">{t("Repository path")}</Label>
        <div className="flex gap-1">
          <div className="relative min-w-0 flex-1">
            <FolderTree className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="path-filter"
            value={draft.path}
            onChange={(event) => setDraft((current) => ({ ...current, path: event.target.value }))}
            placeholder={t("e.g. internal/parser")}
            className="h-8 pl-7 text-xs"
            autoComplete="off"
          />
          </div>
          <Popover open={pathPickerOpen} onOpenChange={(open) => { setPathPickerOpen(open); if (open) setPickerParent("") }}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="icon-sm" className="size-8 shrink-0" aria-label={t("Choose repository path")} title={t("Choose repository path")}>
                <FolderOpen />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-2">
              <div className="flex items-center gap-1 border-b pb-2">
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
              <div className="mt-2 max-h-56 overflow-y-auto">
                {directories.isPending ? <div className="px-2 py-8 text-center text-xs text-muted-foreground">{t("Loading folders…")}</div>
                  : directories.isError ? <div className="px-2 py-8 text-center text-xs text-destructive">{t("Unable to load folders")}</div>
                  : directories.data.data.directories.length === 0 ? <div className="px-2 py-8 text-center text-xs text-muted-foreground">{t("No subfolders")}</div>
                  : directories.data.data.directories.map((directory) => {
                    const name = directory.split("/").at(-1) ?? directory
                    return <Button key={directory} type="button" variant="ghost" className="h-8 w-full justify-start px-2 font-mono text-xs" onClick={() => setPickerParent(directory)} title={`${t("Open folder")}: ${directory}`}>
                      <FolderTree className="text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-left">{name}</span>
                      <ChevronRight className="text-muted-foreground" />
                    </Button>
                  })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex gap-1">
        <Button type="submit" size="sm" className="h-8" disabled={loading || sameFilters(draft, value)}>{t("Apply")}</Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
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
