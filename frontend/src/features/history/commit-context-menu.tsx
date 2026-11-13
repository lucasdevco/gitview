// Right-click menu of a commit in the history, in Sourcetree's order. The
// virtual "未提交的更改" row has no menu.
import { ContextMenu } from "radix-ui"
import type { ReactNode } from "react"
import { MenuItem, MenuNotice, MenuSeparator, menuContentClass } from "@/features/operations/context-menu"
import type { GraphCommit } from "@/lib/api/history"
import type { RepoSummary } from "@/lib/api/repos"
import type { CommitActions } from "./commit-operations"

export function CommitContextMenu({
  commit,
  summary,
  inHead,
  actions,
  onOpen,
  children,
}: {
  commit: GraphCommit
  summary: RepoSummary
  /** HEAD's history already contains the commit: merging, rebasing onto or cherry-picking it changes nothing. */
  inHead: boolean
  actions?: CommitActions
  /** Called when the menu opens, e.g. to select the row like Sourcetree does. */
  onOpen?: () => void
  /** The row the menu opens on. */
  children: ReactNode
}) {
  const run = (action: ((commit: GraphCommit) => void) | undefined) => (action ? () => action(commit) : undefined)
  // Nothing that changes the repository starts while another operation is in progress.
  const busy = !actions || !!actions.inProgress
  const checkedOut = summary.detached && summary.head === commit.oid
  return (
    <ContextMenu.Root onOpenChange={(open) => open && onOpen?.()}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContentClass} aria-label={`提交 ${commit.oid.slice(0, 7)}`}>
          {actions?.inProgress && <MenuNotice>{actions.inProgress}</MenuNotice>}
          {!actions?.inProgress && actions?.writesBlocked && <MenuNotice>{actions.writesBlocked}</MenuNotice>}
          <MenuItem disabled={busy || checkedOut} onSelect={run(actions?.checkout)}>
            检出…
          </MenuItem>
          <MenuItem disabled={busy || summary.detached || inHead} onSelect={run(actions?.merge)}>
            合并至当前分支
          </MenuItem>
          <MenuItem disabled={busy || inHead} onSelect={run(actions?.rebase)}>
            变基当前分支到此提交…
          </MenuItem>
          <MenuSeparator />
          <MenuItem disabled={busy} onSelect={run(actions?.createBranch)}>
            新建分支…
          </MenuItem>
          <MenuItem disabled={busy} onSelect={run(actions?.createTag)}>
            新建标签…
          </MenuItem>
          <MenuSeparator />
          <MenuItem disabled={busy} onSelect={run(actions?.reset)}>
            重置当前分支到此提交…
          </MenuItem>
          <MenuItem disabled={busy} onSelect={run(actions?.revert)}>
            反转提交…
          </MenuItem>
          <MenuItem disabled={busy || inHead} onSelect={run(actions?.cherryPick)}>
            遴选
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={run(actions?.copySha)}>复制 SHA 到剪贴板</MenuItem>
          <MenuSeparator />
          <MenuItem disabled>与当前对比</MenuItem>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
