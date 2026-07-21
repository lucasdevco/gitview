import { CircleAlert, Info, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { Warning } from "@/lib/api"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type WarningLevel = "warning" | "notice"

type WarningPresentation = {
  level: WarningLevel
  title: Parameters<ReturnType<typeof useI18n>["t"]>[0]
  description: Parameters<ReturnType<typeof useI18n>["t"]>[0]
}

const presentations: Record<string, WarningPresentation> = {
  shallow_repository: {
    level: "warning",
    title: "Repository history may be incomplete",
    description:
      "This is a shallow clone, so historical totals and trends may be lower than the full repository history.",
  },
  possible_duplicate_identity: {
    level: "warning",
    title: "Contributor identities may be split",
    description:
      "{count} contributor name(s) use multiple email addresses, so the same person may appear more than once.",
  },
  source_parse_failed: {
    level: "warning",
    title: "Some source files could not be fully parsed",
    description:
      "{count} source file(s) contained parse errors. Functions recovered from valid syntax are still included.",
  },
  binary_files_excluded: {
    level: "notice",
    title: "Binary changes were excluded",
    description: "{count} binary file change(s) were excluded from line totals.",
  },
  dependency_source_excluded: {
    level: "notice",
    title: "Dependency source was excluded",
    description: "{count} dependency source file(s) were excluded from function analysis.",
  },
  function_lineage_probable: {
    level: "notice",
    title: "Function history uses approximate matching",
    description: "Moves, renames, and function boundary changes may not be fully attributed.",
  },
}

const fallbackPresentation: WarningPresentation = {
  level: "warning",
  title: "Data quality notice",
  description: "Data quality notice",
}

export function ReportWarnings({
  warnings,
  className,
}: {
  warnings: Warning[]
  className?: string
}) {
  const { t } = useI18n()
  if (warnings.length === 0) return null

  const items = warnings.map((warning) => ({
    warning,
    presentation: presentations[warning.code] ?? fallbackPresentation,
  }))
  const attentionCount = items.filter((item) => item.presentation.level === "warning").length

  return (
    <details
      className={cn(
        "group overflow-hidden rounded-md border border-warning/30 bg-warning/[0.045]",
        className,
      )}
      open={attentionCount > 0}
    >
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs marker:hidden select-none [&::-webkit-details-marker]:hidden">
        <TriangleAlert className="size-3.5 shrink-0 text-warning" />
        <span className="font-medium">
          {t("Data notices ({count})", { count: warnings.length })}
        </span>
        {attentionCount > 0 && (
          <Badge variant="outline" className="h-4 border-warning/40 px-1.5 text-[9px] text-warning">
            {t("{count} need attention", { count: attentionCount })}
          </Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground group-open:hidden">
          {t("Show details")}
        </span>
        <span className="ml-auto hidden text-[10px] text-muted-foreground group-open:inline">
          {t("Hide details")}
        </span>
      </summary>

      <div
        className="border-t border-warning/20 px-3 py-1"
        role="region"
        aria-label={t("Data quality notices")}
      >
        {items.map(({ warning, presentation }) => {
          const count = warning.message.match(/\d+/)?.[0] ?? "0"
          const Icon = presentation.level === "warning" ? CircleAlert : Info
          const description =
            presentation === fallbackPresentation
              ? warning.message
              : t(presentation.description, { count })

          return (
            <div
              key={warning.code}
              className="grid grid-cols-[1rem_1fr] gap-x-2 border-b border-warning/15 py-2 last:border-b-0"
            >
              <Icon
                className={cn(
                  "mt-0.5 size-3.5",
                  presentation.level === "warning" ? "text-warning" : "text-muted-foreground",
                )}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium">{t(presentation.title)}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {t(presentation.level === "warning" ? "Needs attention" : "Analysis note")}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </details>
  )
}
