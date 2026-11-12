import { GitBranch, Tag } from "lucide-react"
import type { Refs } from "@/lib/api/history"

/** A ref pointing at a commit, as shown before its subject. */
export type RefInfo = {
  name: string
  kind: "local" | "remote" | "tag"
  /** Commits the local branch is behind its upstream; 0 otherwise. */
  behind: number
}

/** Groups refs by the commit they point to: remote branches, then local branches, then tags. */
export function refsByCommit(refs: Refs | undefined, showRemotes: boolean): Map<string, RefInfo[]> {
  const map = new Map<string, RefInfo[]>()
  const add = (oid: string, info: RefInfo) => {
    const list = map.get(oid)
    if (list) list.push(info)
    else map.set(oid, [info])
  }
  if (!refs) return map
  if (showRemotes) {
    for (const remote of refs.remotes) {
      for (const branch of remote.branches) add(branch.oid, { name: branch.name, kind: "remote", behind: 0 })
    }
  }
  for (const branch of refs.branches) add(branch.oid, { name: branch.name, kind: "local", behind: branch.behind })
  for (const tag of refs.tags) add(tag.oid, { name: tag.name, kind: "tag", behind: 0 })
  return map
}

/** Shortens long text by replacing its middle with "…". */
export function middleTruncate(text: string, max = 26): string {
  if (text.length <= max) return text
  const keep = Math.floor((max - 1) / 2)
  return `${text.slice(0, keep)}…${text.slice(text.length - keep)}`
}

/** A branch or tag chip tinted with the commit's lane colour. */
export function RefLabel({ refInfo, color }: { refInfo: RefInfo; color: string }) {
  const Icon = refInfo.kind === "tag" ? Tag : GitBranch
  return (
    <>
      <span
        title={refInfo.name}
        style={{ borderColor: `${color}80`, backgroundColor: `${color}26` }}
        className="inline-flex shrink-0 items-center gap-0.5 rounded border px-1 text-[11px] leading-4 text-foreground"
      >
        <Icon className="size-3" strokeWidth={1.75} />
        {middleTruncate(refInfo.name)}
      </span>
      {refInfo.behind > 0 && (
        <span className="shrink-0 rounded bg-destructive px-1 text-[11px] leading-4 text-white">
          落后{refInfo.behind}个版本
        </span>
      )}
    </>
  )
}
