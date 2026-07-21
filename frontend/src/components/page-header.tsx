import { useLayoutEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

export function PageHeader({ context, actions }: { context: ReactNode; actions?: ReactNode }) {
  const [targets, setTargets] = useState<{ context: HTMLElement; actions: HTMLElement } | null>(
    null,
  )

  useLayoutEffect(() => {
    const contextTarget = document.getElementById("app-header-context")
    const actionsTarget = document.getElementById("app-header-actions")
    if (contextTarget && actionsTarget)
      setTargets({ context: contextTarget, actions: actionsTarget })
  }, [])

  if (!targets) return null
  return (
    <>
      {createPortal(
        <>
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
          {context}
        </>,
        targets.context,
      )}
      {actions && createPortal(actions, targets.actions)}
    </>
  )
}
