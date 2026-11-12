// Sidebar section 已贮藏: the stash list, with 应用 / 删除 in each row's context menu.
import { useQuery } from "@tanstack/react-query"
import { Archive } from "lucide-react"
import { ContextMenu } from "radix-ui"
import type { ReactNode } from "react"
import type { StashAction } from "@/features/stash/stash-sheets"
import { useApi } from "@/lib/api/context"
import { type Stash, stashesQuery } from "@/lib/api/stashes"
import { Row, Section } from "./sidebar-parts"

export function StashesSection({
  repoId,
  selected,
  onSelect,
  onAction,
}: {
  repoId: string
  /** Oid of the stash being shown, highlighted in the list. */
  selected?: string
  onSelect: (stash: Stash) => void
  /** Asks to apply or delete a stash; the caller confirms first. */
  onAction: (action: StashAction) => void
}) {
  const api = useApi()
  const stashes = useQuery(stashesQuery(api, repoId))
  return (
    <Section icon={Archive} title="已贮藏">
      {stashes.error && (
        <p role="alert" className="px-9 py-0.5 text-destructive" title={stashes.error.message}>
          无法加载贮藏
        </p>
      )}
      {stashes.data?.map((stash) => (
        <ContextMenu.Root key={stash.oid}>
          <ContextMenu.Trigger asChild>
            <div>
              <Row depth={1} title={stash.name} active={stash.oid === selected} onClick={() => onSelect(stash)}>
                <span className="truncate">{stash.message}</span>
              </Row>
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className="z-50 min-w-44 rounded-lg border bg-popover p-1 text-[12px] text-popover-foreground shadow-xl">
              <MenuItem onSelect={() => onAction({ kind: "apply", stash })}>应用贮藏 {stash.name}…</MenuItem>
              <ContextMenu.Separator className="mx-2 my-1 h-px bg-border" />
              <MenuItem onSelect={() => onAction({ kind: "drop", stash })}>删除贮藏 {stash.name}…</MenuItem>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ))}
    </Section>
  )
}

function MenuItem({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className="flex cursor-default items-center rounded px-2 py-1 outline-none select-none data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground"
    >
      {children}
    </ContextMenu.Item>
  )
}
