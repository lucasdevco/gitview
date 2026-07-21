import { GripHorizontal, GripVertical } from "lucide-react"
import { Group, type Layout, Panel, Separator } from "react-resizable-panels"

import { cn } from "@/lib/utils"

export { Group as ResizablePanelGroup, Panel as ResizablePanel }

export function ResizableHandle({
  orientation,
  className,
}: {
  orientation: "horizontal" | "vertical"
  className?: string
}) {
  const horizontal = orientation === "horizontal"
  const Grip = horizontal ? GripVertical : GripHorizontal

  return (
    <Separator
      className={cn(
        "group relative z-10 flex shrink-0 items-center justify-center bg-border outline-none transition-colors hover:bg-primary/50 focus-visible:bg-primary/70 data-[separator=active]:bg-primary/70",
        horizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
        className,
      )}
    >
      <span
        className={cn(
          "absolute flex items-center justify-center rounded-sm border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
          horizontal ? "h-7 w-3" : "h-3 w-7",
        )}
      >
        <Grip className="size-2.5" />
      </span>
    </Separator>
  )
}

export function readPanelLayout(key: string): Layout | undefined {
  try {
    const value = localStorage.getItem(key)
    if (!value) return undefined
    const layout: unknown = JSON.parse(value)
    if (
      !layout ||
      typeof layout !== "object" ||
      !Object.values(layout).every((size) => typeof size === "number" && Number.isFinite(size))
    )
      return undefined
    return layout as Layout
  } catch {
    return undefined
  }
}

export function savePanelLayout(key: string, layout: Layout) {
  try {
    localStorage.setItem(key, JSON.stringify(layout))
  } catch {
    // Resizing should still work when storage is unavailable.
  }
}
