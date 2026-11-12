import { Copy, Ellipsis, type LucideIcon, Minus, MoveRight, Plus, Repeat, TriangleAlert } from "lucide-react"
import type { ChangeKind } from "@/lib/api/worktree"
import { cn } from "@/lib/utils"

const STYLES: Record<ChangeKind, { className: string; label: string; icon?: LucideIcon }> = {
  added: { className: "bg-success", label: "新增", icon: Plus },
  modified: { className: "bg-warning", label: "修改", icon: Ellipsis },
  deleted: { className: "bg-destructive", label: "删除", icon: Minus },
  renamed: { className: "bg-chart-4", label: "重命名", icon: MoveRight },
  copied: { className: "bg-chart-4", label: "复制", icon: Copy },
  typechanged: { className: "bg-warning", label: "类型变更", icon: Repeat },
  untracked: { className: "bg-primary", label: "未跟踪" },
  conflicted: { className: "bg-destructive", label: "冲突", icon: TriangleAlert },
}

/** Human-readable name of a change kind, e.g. "重命名". */
export function changeKindLabel(status: ChangeKind): string {
  return STYLES[status].label
}

/** Sourcetree-style square badge for a file's change kind. */
export function FileStatusIcon({ status }: { status: ChangeKind }) {
  const style = STYLES[status]
  const Icon = style.icon
  return (
    <span
      title={style.label}
      role="img"
      aria-label={style.label}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] text-white",
        style.className,
      )}
    >
      {Icon ? (
        <Icon className="size-3" strokeWidth={3} />
      ) : (
        <span className="text-[10px] leading-none font-bold">?</span>
      )}
    </span>
  )
}
