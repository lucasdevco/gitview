// Shared shell for the operation dialogs (分支, 拉取, 推送, 抓取, 合并, 贮藏),
// modelled on Sourcetree's sheets. The footer shows the git command the
// dialog will run, built with the lib/command-preview builders from the same
// request the dialog sends, so the preview matches the command log.
import { Dialog } from "radix-ui"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function OperationSheet({
  title,
  showTitle = false,
  width = 560,
  command,
  onClose,
  onConfirm,
  confirmLabel = "确定",
  destructive = false,
  disabled,
  blockedBy,
  queuesBehind,
  header,
  children,
}: {
  title: string
  /** Show the title in the sheet; otherwise it is only announced to screen readers. */
  showTitle?: boolean
  width?: number
  /** Preview of the git command the confirm button runs. */
  command: string
  onClose: () => void
  onConfirm: () => void
  confirmLabel?: string
  /** The confirm button loses work (discard, delete, abort): shown in red. */
  destructive?: boolean
  disabled?: boolean
  /**
   * Why the operation cannot run now (a background job holds the write
   * lock, see useWritesBlocked): shown in the sheet, confirm disabled.
   */
  blockedBy?: string
  /** For an operation that runs as a job: the job it will queue behind, shown in the sheet. */
  queuesBehind?: string
  /**
   * Content to the right of a visible title, such as tabs. A sheet with a
   * header is anchored by its top edge rather than centred, so switching
   * tabs that differ in height does not move the tabs.
   */
  header?: ReactNode
  children: ReactNode
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content
          style={{ width }}
          className={cn(
            "fixed left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border bg-popover text-popover-foreground shadow-2xl",
            showTitle && header ? "top-[12vh]" : "top-1/2 -translate-y-1/2",
          )}
          aria-describedby={undefined}
        >
          {showTitle ? (
            <div className="flex items-start justify-between px-5 pt-4">
              <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
              {header}
            </div>
          ) : (
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
          )}
          <div className="space-y-2.5 px-5 py-4">
            {children}
            {(blockedBy || queuesBehind) && (
              <p role="status" className="rounded-md bg-muted px-2.5 py-1.5 text-muted-foreground">
                {blockedBy ?? `${queuesBehind}；确定后将排队，在其后开始。`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 px-5 pb-4">
            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground" title={command}>
              {command}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="h-6 min-w-20 rounded-md border bg-background px-3 shadow-xs"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={disabled || !!blockedBy}
              title={blockedBy}
              data-variant={destructive ? "destructive" : "default"}
              className={cn(
                "h-6 min-w-20 rounded-md px-3 shadow-xs disabled:bg-muted disabled:text-muted-foreground",
                destructive
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** A labelled row: right-aligned label, control, optional hint below. */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-start gap-x-2">
      <span className="pt-1 text-right">{label}：</span>
      <div className="min-w-0">
        {children}
        {hint && <div className="mt-0.5 truncate px-1 text-muted-foreground">{hint}</div>}
      </div>
    </div>
  )
}

export function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

/** A titled, shaded box of options. */
export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 pl-1 text-[11px] font-medium text-muted-foreground">{title}</div>
      <div className="space-y-1.5 rounded-md bg-muted/60 p-2.5">{children}</div>
    </div>
  )
}

export const selectClass = "h-6 w-full rounded-md border bg-background px-2"
export const inputClass = "h-6 w-full rounded-md border bg-background px-2 outline-none focus:ring-2 focus:ring-ring/50"
