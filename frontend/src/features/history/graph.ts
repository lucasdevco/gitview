// Commit graph lane layout. Same idea as lazygit's pipe sets: walk commits
// newest-first and keep a list of lanes, each waiting for the oid it leads to.

/** A commit as the layout sees it. Any node works, including virtual ones. */
export type GraphNode = { oid: string; parents: string[] }

/**
 * A line drawn in one half of a row: `top` runs from the row's top edge to
 * its middle, `bottom` from the middle to the bottom edge. `color` indexes
 * {@link laneColor}.
 */
export type Segment = { fromLane: number; toLane: number; half: "top" | "bottom"; color: number }

/** How to draw one row: the node's lane and colour, its lines, and the lanes it spans. */
export type GraphRow = { lane: number; color: number; segments: Segment[]; width: number }

/**
 * Lays out lanes for `nodes`, which must list every node before its parents
 * (newest first, as `git log --date-order` or `--topo-order` does). Returns
 * one row per node, in the same order. A parent that never appears keeps its
 * lane open to the bottom.
 */
export function layoutGraph(nodes: GraphNode[]): GraphRow[] {
  let lanes: (string | null)[] = []
  let colors: number[] = []
  let nextColor = 0
  const rows: GraphRow[] = []

  for (const node of nodes) {
    // Lanes coming down from the previous row, before this node claims one.
    const incoming = lanes
    let lane = lanes.indexOf(node.oid)
    if (lane === -1) {
      lane = lanes.indexOf(null)
      if (lane === -1) lane = lanes.length
      lanes = [...lanes]
      lanes[lane] = node.oid
      colors = [...colors]
      colors[lane] = nextColor++
    }
    const color = colors[lane] ?? 0
    const segments: Segment[] = []

    // Top half: every live lane enters this row; lanes waiting for this node converge on it.
    incoming.forEach((waiting, index) => {
      if (waiting === null) return
      segments.push({
        fromLane: index,
        toLane: waiting === node.oid ? lane : index,
        half: "top",
        color: colors[index] ?? 0,
      })
    })

    // Bottom half: the first parent continues this lane unless another lane already waits for it;
    // each further (merge) parent joins a lane waiting for it or opens one with a new colour.
    const after = lanes.map((waiting) => (waiting === node.oid ? null : waiting))
    const afterColors = [...colors]
    const [first, ...rest] = node.parents
    if (first !== undefined) {
      const existing = after.indexOf(first)
      if (existing === -1) {
        after[lane] = first
        afterColors[lane] = color
      } else {
        segments.push({ fromLane: lane, toLane: existing, half: "bottom", color: afterColors[existing] ?? color })
      }
    }
    for (const parent of rest) {
      let target = after.indexOf(parent)
      if (target === -1) {
        target = after.indexOf(null)
        if (target === -1) target = after.length
        after[target] = parent
        afterColors[target] = nextColor++
      }
      segments.push({ fromLane: lane, toLane: target, half: "bottom", color: afterColors[target] ?? 0 })
    }

    // Straight lines down: this node's lane if it continues, and every lane passing by.
    after.forEach((waiting, index) => {
      if (waiting === null) return
      const continues = index === lane && !segments.some((s) => s.half === "bottom" && s.toLane === lane)
      const passesThrough = index !== lane && incoming[index] === waiting
      if (continues || passesThrough) {
        segments.push({ fromLane: index, toLane: index, half: "bottom", color: afterColors[index] ?? 0 })
      }
    })

    while (after.length && after[after.length - 1] === null) after.pop()
    lanes = after
    colors = afterColors.slice(0, after.length)

    let width = lane + 1
    for (const segment of segments) width = Math.max(width, segment.fromLane + 1, segment.toLane + 1)
    rows.push({ lane, color, segments, width })
  }
  return rows
}

export const laneColors = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#eab308", "#ef4444"]

/** The CSS colour for a lane colour index; colours repeat every eight lanes. */
export function laneColor(index: number): string {
  return laneColors[index % laneColors.length] ?? "#3b82f6"
}
