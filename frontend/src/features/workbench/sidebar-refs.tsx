// Sidebar sections for refs: the local branch tree, tags and remotes.
import { ChevronDown, ChevronRight, Cloud, Folder, GitBranch, Tag } from "lucide-react"
import { Fragment, type ReactNode, useState } from "react"
import { BranchContextMenu } from "@/features/branches/branch-context-menu"
import { useBranchActions } from "@/features/branches/branch-operations"
import { buildRefTree, type RefTreeNode } from "@/features/history/ref-tree"
import type { Branch, Refs, Remote } from "@/lib/api/history"
import type { RepoSummary } from "@/lib/api/repos"
import { cn } from "@/lib/utils"
import { Row, Section } from "./sidebar-parts"

type Reveal = (oid: string) => void

function FolderRow({ node, depth, children }: { node: RefTreeNode; depth: number; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <Row depth={depth - 1} onClick={() => setOpen(!open)} title={node.path}>
        {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <Folder className="size-3.5 shrink-0" strokeWidth={1.5} />
        <span className="truncate">{node.name}</span>
      </Row>
      {open && children}
    </>
  )
}

/** Renders a ref tree; `leaf` draws each ref. */
function RefTree({
  nodes,
  depth,
  leaf,
}: {
  nodes: RefTreeNode[]
  depth: number
  leaf: (node: RefTreeNode, depth: number) => ReactNode
}) {
  return nodes.map((node) =>
    node.leaf ? (
      <Fragment key={`leaf:${node.path}`}>{leaf(node, depth)}</Fragment>
    ) : (
      <FolderRow key={`folder:${node.path}`} node={node} depth={depth}>
        <RefTree nodes={node.children} depth={depth + 1} leaf={leaf} />
      </FolderRow>
    ),
  )
}

function LocalBranchRow({
  branch,
  label,
  depth,
  currentBranch,
  remotes,
  onReveal,
}: {
  branch: Branch
  label: string
  depth: number
  currentBranch: string
  remotes: Remote[]
  onReveal: Reveal
}) {
  const actions = useBranchActions()
  const tracking =
    branch.upstream &&
    (branch.upstreamGone
      ? `，跟踪的 ${branch.upstream} 已不存在`
      : `，跟踪 ${branch.upstream}（领先 ${branch.ahead}，落后 ${branch.behind}）`)
  return (
    <BranchContextMenu branch={branch} currentBranch={currentBranch} remotes={remotes} actions={actions}>
      <Row
        depth={depth}
        title={`${branch.name}${tracking || ""}。单击定位到提交，双击检出，右键查看更多操作`}
        onClick={() => onReveal(branch.oid)}
        onDoubleClick={() => !branch.current && actions?.checkout(branch.name)}
      >
        <span
          className={cn("-ml-3.5 size-2 shrink-0 rounded-full", branch.current ? "bg-chart-5" : "bg-transparent")}
        />
        <span className={cn("truncate", branch.current && "font-semibold")}>{label}</span>
        {(branch.ahead > 0 || branch.behind > 0) && (
          <span className="ml-auto shrink-0 rounded bg-muted-foreground/60 px-1 text-[10px] leading-4 text-background">
            {branch.ahead > 0 && `${branch.ahead}↑`}
            {branch.behind > 0 && `${branch.behind}↓`}
          </span>
        )}
      </Row>
    </BranchContextMenu>
  )
}

/** The checked-out branch before it has commits, or a detached HEAD: not in the branch list. */
function HeadRow({ summary, onReveal }: { summary: RepoSummary; onReveal: Reveal }) {
  const label = summary.detached ? `HEAD（分离于 ${summary.head.slice(0, 7)}）` : summary.branch
  return (
    <Row
      depth={1}
      title={summary.empty ? `${label}（尚无提交）` : label}
      onClick={summary.head ? () => onReveal(summary.head) : undefined}
    >
      <span className="-ml-3.5 size-2 shrink-0 rounded-full bg-chart-5" />
      <span className="truncate font-semibold">{label}</span>
    </Row>
  )
}

/** Name filter shared by the ref sections: case-insensitive substring. */
export type RefFilter = (name: string) => boolean

export function BranchesSection({
  summary,
  refs,
  filter,
  onReveal,
}: {
  summary: RepoSummary
  refs?: Refs
  filter: RefFilter
  onReveal: Reveal
}) {
  const branches = (refs?.branches ?? []).filter((branch) => filter(branch.name))
  const byName = new Map(branches.map((branch) => [branch.name, branch]))
  const headListed = !summary.detached && refs?.branches.some((branch) => branch.current)
  const headLabel = summary.detached ? "HEAD" : summary.branch
  return (
    <Section icon={GitBranch} title="分支">
      {refs && !headListed && filter(headLabel) && <HeadRow summary={summary} onReveal={onReveal} />}
      <RefTree
        nodes={buildRefTree(branches.map((branch) => branch.name))}
        depth={1}
        leaf={(node, depth) => {
          const branch = byName.get(node.path)
          return (
            branch && (
              <LocalBranchRow
                branch={branch}
                label={node.name}
                depth={depth}
                currentBranch={summary.branch}
                remotes={refs?.remotes ?? []}
                onReveal={onReveal}
              />
            )
          )
        }}
      />
    </Section>
  )
}

export function TagsSection({ refs, filter, onReveal }: { refs?: Refs; filter: RefFilter; onReveal: Reveal }) {
  return (
    <Section icon={Tag} title="标签">
      {(refs?.tags ?? [])
        .filter((tag) => filter(tag.name))
        .map((tag) => (
          <Row key={tag.name} depth={1} title={`${tag.name}。单击定位到提交`} onClick={() => onReveal(tag.oid)}>
            <span className="truncate">{tag.name}</span>
          </Row>
        ))}
    </Section>
  )
}

function RemoteRow({ name, children }: { name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Row depth={0} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <span className="truncate">{name}</span>
      </Row>
      {open && children}
    </>
  )
}

export function RemotesSection({ refs, filter, onReveal }: { refs?: Refs; filter: RefFilter; onReveal: Reveal }) {
  return (
    <Section icon={Cloud} title="远端">
      {(refs?.remotes ?? []).map((remote) => {
        const branches = remote.branches.filter((branch) => filter(branch.name))
        const byBranch = new Map(branches.map((branch) => [branch.branch, branch]))
        return (
          <RemoteRow key={remote.name} name={remote.name}>
            <RefTree
              nodes={buildRefTree(branches.map((branch) => branch.branch))}
              depth={2}
              leaf={(node, depth) => {
                const branch = byBranch.get(node.path)
                return (
                  branch && (
                    <Row depth={depth} title={`${branch.name}。单击定位到提交`} onClick={() => onReveal(branch.oid)}>
                      <span className="truncate">{node.name}</span>
                    </Row>
                  )
                )
              }}
            />
          </RemoteRow>
        )
      })}
    </Section>
  )
}
