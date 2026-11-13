// Building blocks of the right-click menus (branches in the sidebar, commits
// in the history), styled like Sourcetree's menus.
import { ChevronRight } from "lucide-react"
import { ContextMenu } from "radix-ui"
import type { ReactNode } from "react"

export const menuContentClass =
  "z-50 min-w-64 rounded-lg border bg-popover p-1 text-[12px] text-popover-foreground shadow-xl"

const menuItemClass =
  "flex cursor-default items-center rounded px-2 py-1 outline-none select-none data-[disabled]:text-muted-foreground/60 data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground"

/** A menu item; without `onSelect` it is disabled. */
export function MenuItem({
  children,
  onSelect,
  disabled,
}: {
  children: ReactNode
  onSelect?: () => void
  disabled?: boolean
}) {
  return (
    <ContextMenu.Item className={menuItemClass} disabled={disabled || !onSelect} onSelect={onSelect}>
      {children}
    </ContextMenu.Item>
  )
}

export function MenuSeparator() {
  return <ContextMenu.Separator className="mx-2 my-1 h-px bg-border" />
}

/** A line of text at the top of a menu saying why some items are disabled. */
export function MenuNotice({ children }: { children: ReactNode }) {
  return (
    <>
      <div role="status" className="max-w-72 px-2 py-1 text-muted-foreground">
        {children}
      </div>
      <MenuSeparator />
    </>
  )
}

export function SubMenu({ label, disabled, children }: { label: string; disabled?: boolean; children: ReactNode }) {
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger className={menuItemClass} disabled={disabled}>
        {label}
        <ChevronRight className="ml-auto size-3.5" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent className="z-50 max-h-80 min-w-48 overflow-y-auto rounded-lg border bg-popover p-1 text-[12px] text-popover-foreground shadow-xl">
          {children}
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  )
}
