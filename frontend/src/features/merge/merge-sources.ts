import type { Refs } from "@/lib/api/history"

/**
 * Branches the 合并 sheet offers to merge into the current branch: the other
 * local branches, then the remote-tracking branches (remote HEADs are not
 * listed by the refs API).
 */
export function mergeSources(refs: Refs | undefined): string[] {
  if (!refs) return []
  return [
    ...refs.branches.filter((branch) => !branch.current).map((branch) => branch.name),
    ...refs.remotes.flatMap((remote) => remote.branches.map((branch) => branch.name)),
  ]
}
