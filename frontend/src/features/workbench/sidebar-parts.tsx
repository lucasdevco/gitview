import { ChevronDown, type LucideIcon } from "lucide-react"
import { type ReactNode, useState } from "react"
import { cn } from "@/lib/utils"

/** A sidebar entry, indented by `depth`. */
export function Row({
  depth,
  active,
  onClick,
  onDoubleClick,
  title,
  children,
}: {
  depth: number
  active?: boolean
  onClick?: () => void
  onDoubleClick?: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-current={active ? "page" : undefined}
      style={{ paddingLeft: 16 + depth * 14 }}
      className={cn(
        "mx-2 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-md py-[3px] pr-2 text-left",
        active ? "bg-primary text-primary-foreground" : "hover:bg-accent/70",
      )}
    >
      {children}
    </button>
  )
}

/** A collapsible sidebar group such as 分支 or 标签. */
export function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group mt-3 flex w-full items-center gap-2 px-3 py-1 text-muted-foreground"
      >
        <Icon className="size-4" strokeWidth={1.5} />
        <span>{title}</span>
        <ChevronDown className={cn("ml-auto size-3 opacity-0 group-hover:opacity-100", !open && "-rotate-90")} />
      </button>
      {open && <div>{children}</div>}
    </section>
  )
}
