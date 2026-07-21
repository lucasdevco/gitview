import { GitBranch } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Repository } from "@/lib/api"
import { useI18n } from "@/lib/i18n"

export function RepositoryContext({ repository }: { repository: Repository }) {
  const { t } = useI18n()

  return <>
    <div className="flex size-6 shrink-0 items-center justify-center rounded bg-primary font-mono text-[10px] font-bold text-primary-foreground">GV</div>
    <div className="min-w-0">
      <div className="truncate text-xs font-semibold">{repository.name}</div>
      <Tooltip>
        <TooltipTrigger asChild><div className="max-w-[44vw] truncate text-[10px] text-muted-foreground">{repository.root}</div></TooltipTrigger>
        <TooltipContent>{repository.root}</TooltipContent>
      </Tooltip>
    </div>
    <Badge variant="outline" className="ml-1 gap-1 font-mono text-[10px]"><GitBranch className="size-3" />{repository.branch || t("detached")}</Badge>
    <Badge variant="secondary" className="hidden font-mono text-[10px] sm:inline-flex">{repository.head.slice(0, 8) || t("empty")}</Badge>
  </>
}
