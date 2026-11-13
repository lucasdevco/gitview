// 复制分支名字: copies a branch name to the clipboard, confirms it briefly,
// and when the browser refuses clipboard access shows the name so it can be
// copied by hand.
import { Check } from "lucide-react"
import { Dialog } from "radix-ui"
import { type ReactNode, useEffect, useState } from "react"

/** How long the 已复制 confirmation stays up. */
const CONFIRMATION_MS = 2000

type CopyState = { kind: "copied" | "failed"; name: string }

/** `copy(name)` copies a branch name; render `feedback` once in the workbench. */
export function useCopyBranchName(): { copy: (name: string) => void; feedback: ReactNode } {
  const [state, setState] = useState<CopyState>()
  const copied = state?.kind === "copied" ? state : undefined
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setState(undefined), CONFIRMATION_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = (name: string) => {
    const failed = () => setState({ kind: "failed", name })
    // Without a secure context there is no clipboard API at all.
    if (!navigator.clipboard) return failed()
    // A fresh state object restarts the confirmation's timer on every copy.
    navigator.clipboard.writeText(name).then(() => setState({ kind: "copied", name }), failed)
  }

  let feedback: ReactNode = null
  if (copied) {
    feedback = (
      <div
        role="status"
        className="fixed bottom-14 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1.5 rounded-md border bg-popover px-3 py-1.5 text-[12px] text-popover-foreground shadow-lg"
      >
        <Check className="size-3.5 shrink-0 text-emerald-600" />
        <span className="truncate">已复制分支名字 {copied.name}</span>
      </div>
    )
  } else if (state?.kind === "failed") {
    feedback = <CopyFailedDialog name={state.name} onClose={() => setState(undefined)} />
  }
  return { copy, feedback }
}

function CopyFailedDialog({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[420px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border bg-popover p-5 text-[12px] text-popover-foreground shadow-2xl">
          <Dialog.Title className="text-[15px] font-semibold">无法复制分支名字</Dialog.Title>
          <Dialog.Description>
            浏览器没有允许访问剪贴板。下方的分支名字已选中，请手动复制（⌘C / Ctrl+C）。
          </Dialog.Description>
          <input
            readOnly
            value={name}
            aria-label="分支名字"
            // biome-ignore lint/a11y/noAutofocus: the name is selected for copying right away.
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
