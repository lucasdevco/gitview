// Right-click menu of a local branch in the sidebar, in Sourcetree's order.
// Items whose action is not provided by BranchActions are shown disabled.
import { Check } from "lucide-react"
import { ContextMenu } from "radix-ui"
import type { ReactNode } from "react"
import { MenuItem, MenuNotice, MenuSeparator, menuContentClass, SubMenu } from "@/features/operations/context-menu"
import type { Branch, Remote } from "@/lib/api/history"
import type { BranchActions } from "./branch-operations"

export function BranchContextMenu({
  branch,
  currentBranch,
  remotes,
  actions,
  children,
}: {
  branch: Branch
  /** Name of the checked-out branch; empty when HEAD is detached. */
  currentBranch: string
  remotes: Remote[]
  actions?: BranchActions
  /** The row the menu opens on. */
  children: ReactNode
}) {
  const name = branch.name
  const current = branch.current
  const remoteBranches = remotes.flatMap((remote) => remote.branches)
  const run = (action: ((branch: string) => void) | undefined) => (action ? () => action(name) : undefined)
  // Writing right away would wait for a background job; the dialogs and
  // jobs the other items start say so themselves.
  const blocked = !!actions?.writesBlocked
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div>{children}</div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContentClass}>
          {actions?.writesBlocked && <MenuNotice>{actions.writesBlocked}</MenuNotice>}
          <MenuItem disabled={current || blocked} onSelect={run(actions?.checkout)}>
            检出 {name}
          </MenuItem>
          <MenuItem disabled={current || !currentBranch || blocked} onSelect={run(actions?.merge)}>
            合并 {name} 至 {currentBranch || "HEAD"}
          </MenuItem>
          <MenuItem disabled={current} onSelect={run(actions?.rebase)}>
            将当前变更变基到 {name}
          </MenuItem>
          <MenuSeparator />
          <MenuItem disabled={current || !branch.upstream} onSelect={run(actions?.fetchInto)}>
            拿来 {name}
          </MenuItem>
          <MenuSeparator />
          <MenuItem disabled={!branch.upstream} onSelect={run(actions?.pushToUpstream)}>
            推送到 {branch.upstream || "origin"}
            {branch.upstream && "（已跟踪）"}
          </MenuItem>
          <SubMenu label="推送到" disabled={!actions?.pushTo || remotes.length === 0}>
            {remotes.map((remote) => (
              <MenuItem key={remote.name} onSelect={() => actions?.pushTo?.(name, remote.name)}>
                {remote.name}
              </MenuItem>
            ))}
          </SubMenu>
          <SubMenu label="跟踪远程分支" disabled={!actions || remoteBranches.length === 0 || blocked}>
            {remoteBranches.map((remoteBranch) => (
              <MenuItem key={remoteBranch.name} onSelect={() => actions?.setUpstream(name, remoteBranch.name)}>
                <span className="flex size-3.5 items-center">
                  {remoteBranch.name === branch.upstream && <Check className="size-3.5" />}
                </span>
                <span className="ml-1">{remoteBranch.name}</span>
              </MenuItem>
            ))}
          </SubMenu>
          <MenuSeparator />
          <MenuItem disabled={current} onSelect={run(actions?.compare)}>
            与当前对比
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={run(actions?.rename)}>重命名…</MenuItem>
          <MenuItem disabled={current} onSelect={run(actions?.delete)}>
            删除 {name}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={run(actions?.copyName)}>复制分支名字</MenuItem>
          <MenuSeparator />
          <MenuItem disabled>创建拉取请求…</MenuItem>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
