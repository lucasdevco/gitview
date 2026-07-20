import { useEffect, useState } from "react"
import { CalendarDays, FilterX, FolderTree } from "lucide-react"
import { format, parse, startOfYear, subDays } from "date-fns"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { OverviewFilters } from "@/lib/api"
import { emptyFilters, sameFilters } from "@/lib/url-filters"

type Props = {
  value: OverviewFilters
  loading: boolean
  onApply: (filters: OverviewFilters) => void
}

const dateFormat = "yyyy-MM-dd"

export function OverviewFilterBar({ value, loading, onApply }: Props) {
  const [draft, setDraft] = useState(value)
  const [calendarOpen, setCalendarOpen] = useState(false)

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
    : "All history"

  return (
    <form
      className="flex flex-col gap-2 rounded-md border bg-card p-2 sm:flex-row sm:items-end"
      onSubmit={(event) => { event.preventDefault(); onApply(draft) }}
      data-testid="overview-filters"
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <Label className="text-[10px] text-muted-foreground">Author date</Label>
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
                  {{ all: "All", "30d": "30 days", "90d": "90 days", year: "This year" }[preset]}
                </Button>
              ))}
            </div>
            <Calendar
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
        <Label htmlFor="path-filter" className="text-[10px] text-muted-foreground">Repository path</Label>
        <div className="relative">
          <FolderTree className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="path-filter"
            value={draft.path}
            onChange={(event) => setDraft((current) => ({ ...current, path: event.target.value }))}
            placeholder="e.g. internal/parser"
            className="h-8 pl-7 text-xs"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex gap-1">
        <Button type="submit" size="sm" className="h-8" disabled={loading || sameFilters(draft, value)}>Apply</Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          disabled={loading || sameFilters(value, emptyFilters)}
          onClick={() => { setDraft(emptyFilters); onApply(emptyFilters) }}
		  aria-label="Clear filters"
		  title="Clear filters"
        >
          <FilterX className="size-3.5" /><span className="sm:hidden">Clear</span>
        </Button>
      </div>
    </form>
  )
}
