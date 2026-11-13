// 复制分支名字 / 复制 SHA 到剪贴板: copies text to the clipboard, confirms it
// briefly, and when the browser refuses clipboard access shows the text so
// it can be copied by hand.
import { Check } from "lucide-react"
import { Dialog } from "radix-ui"
import { type ReactNode, useEffect, useState } from "react"

/** How long the 已复制 confirmation stays up. */
const CONFIRMATION_MS = 2000

type CopyState = { kind: "copied" | "failed"; text: string; label: string }

/**
 * `copy(text, label)` copies text, naming it by `label` (e.g. "分支名字",
 * "SHA") in the confirmation; render `feedback` once in the workbench.
 */
export function useCopyText(): { copy: (text: string, label: string) => void; feedback: ReactNode } {
  const [state, setState] = useState<CopyState>()
  const copied = state?.kind === "copied" ? state : undefined
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setState(undefined), CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = (text: string, label: string) => {
    const failed = () => setState({ kind: "failed", text, label })
    // Without a secure context there is no clipboard API at all.
    if (!navigator.clipboard) return failed()
    // A fresh state object restarts the confirmation's timer on every copy.
    navigator.clipboard.writeText(text).then(() => setState({ kind: "copied", text, label }), failed)
  }

  let feedback: ReactNode = null
  if (copied) {
    feedback = (
      <div
        role="status"
        className="fixed bottom-14 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1.5 rounded-md border bg-popover px-3 py-1.5 text-[12px] text-popover-foreground shadow-lg"
      >
        <Check className="size-3.5 shrink-0 text-emerald-600" />
        <span className="truncate">
          已复制{copied.label} {copied.text}
        </span>
      </div>
    )
  } else if (state?.kind === "failed") {
    feedback = <CopyFailedDialog text={state.text} label={state.label} onClose={() => setState(undefined)} />
  }
  return { copy, feedback }
}

function CopyFailedDialog({ text, label, onClose }: { text: string; label: string; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[420px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border bg-popover p-5 text-[12px] text-popover-foreground shadow-2xl">
          <Dialog.Title className="text-[15px] font-semibold">无法复制{label}</Dialog.Title>
          <Dialog.Description>
            浏览器没有允许访问剪贴板。下方的{label}已选中，请手动复制（⌘C / Ctrl+C）。
          </Dialog.Description>
          <input
            readOnly
            value={text}
            aria-label={label}
            // biome-ignore lint/a11y/noAutofocus: the text is selected for copying right away.
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            className="h-6 w-full rounded-md border bg-background px-2 font-mono outline-none focus:ring-2 focus:ring-ring/50"
          />
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
