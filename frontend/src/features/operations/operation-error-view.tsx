// Showing a failed write operation: inline inside a dialog, or as its own
// dialog for operations started without one (double-click checkout, menu
// items).
import { AlertCircle, X } from "lucide-react"
import { Dialog } from "radix-ui"
import { describeOperationError } from "./operation-error"

/** A failed operation inside a dialog: summary, advice and git's output. */
export function OperationErrorNotice({ error, onDismiss }: { error: Error; onDismiss?: () => void }) {
  const { summary, advice, output } = describeOperationError(error)
  return (
    <div role="alert" className="rounded-md border border-destructive/40 bg-background">
      <div className="flex items-start gap-2 px-2 py-1.5">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-destructive">{summary}</div>
          {advice && <div>{advice}</div>}
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} aria-label="关闭错误" className="rounded p-0.5 hover:bg-accent">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <pre className="max-h-40 overflow-auto border-t px-2 py-1 font-mono text-[11px] whitespace-pre-wrap">
        {output}
      </pre>
    </div>
  )
}

/** A failed operation that was started without a dialog of its own. */
export function OperationErrorDialog({ title, error, onClose }: { title: string; error: Error; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 w-[520px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border bg-popover p-5 text-popover-foreground shadow-2xl"
          aria-describedby={undefined}
        >
          <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
          <OperationErrorNotice error={error} />
          <div className="flex justify-end">
            <Dialog.Close className="h-6 min-w-20 rounded-md bg-primary px-3 text-primary-foreground shadow-xs">
              好
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
