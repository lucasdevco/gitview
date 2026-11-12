import {
  Archive,
  CircleArrowDown,
  CircleArrowUp,
  CircleDashed,
  CirclePlus,
  GitBranch,
  GitMerge,
  Globe,
  type LucideIcon,
  Monitor,
  Settings,
} from "lucide-react"

function ToolbarButton({
  icon: Icon,
  label,
  badge,
  onClick,
  disabled,
}: {
  icon: LucideIcon
  label: string
  badge?: number
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative flex min-w-11 flex-col items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon className="size-[18px] text-primary" strokeWidth={1.6} />
      <span className="whitespace-nowrap">{label}</span>
      {!!badge && (
        <span className="absolute top-0 left-1/2 ml-1 min-w-3.5 rounded-full bg-primary px-1 text-[9px] leading-3.5 text-primary-foreground">
          {badge}
        </span>
      )}
    </button>
  )
}

const Gap = () => <span className="w-2" />

/**
 * Repository title and the Sourcetree toolbar. Operations are enabled as their
 * features land; until then their buttons are shown disabled.
 */
export function TitleBar({
  name,
  pendingCount,
  onCommit,
  onStash,
}: {
  name: string
  /** Changed files waiting to be committed, shown as the 提交 badge. */
  pendingCount?: number
  onCommit?: () => void
  onStash?: () => void
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-muted/40 pr-2 pl-4">
      <h1 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{name ? `${name} (Git)` : "gitview"}</h1>
      <ToolbarButton icon={CirclePlus} label="提交" badge={pendingCount} onClick={onCommit} disabled={!onCommit} />
      <Gap />
      <ToolbarButton icon={CircleArrowDown} label="拉取" disabled />
      <ToolbarButton icon={CircleArrowUp} label="推送" disabled />
      <ToolbarButton icon={CircleDashed} label="抓取" disabled />
      <Gap />
      <ToolbarButton icon={GitBranch} label="分支" disabled />
      <ToolbarButton icon={GitMerge} label="合并" disabled />
      <Gap />
      <ToolbarButton icon={Archive} label="贮藏" onClick={onStash} disabled={!onStash} />
      <Gap />
      <ToolbarButton icon={Globe} label="显示远程服务器" disabled />
      <ToolbarButton icon={Monitor} label="在 Finder 中显示" disabled />
      <ToolbarButton icon={Settings} label="设置" disabled />
    </header>
  )
}
