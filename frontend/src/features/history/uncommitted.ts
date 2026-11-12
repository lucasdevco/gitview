// The "未提交的更改" row: a virtual graph node standing for the working tree.
import type { GraphNode } from "./graph"

/** Oid of the virtual node. Not hexadecimal, so it never collides with a commit. */
export const UNCOMMITTED = "uncommitted-changes"

/**
 * Prepends the virtual "未提交的更改" node to `nodes` (newest first), with
 * HEAD as its parent so its lane leads down to HEAD. Pass an empty `head` for
 * a repository without commits.
 */
export function withUncommittedChanges(nodes: GraphNode[], head: string): GraphNode[] {
  return [{ oid: UNCOMMITTED, parents: head ? [head] : [] }, ...nodes]
}
