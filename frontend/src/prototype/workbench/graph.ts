// PROTOTYPE — commit graph lane layout (same idea as lazygit's pipe sets:
// walk commits newest-first, keep a list of lanes each waiting for an oid).

export type GraphNode = { oid: string; parents: string[] }

export type Segment = { fromLane: number; toLane: number; half: "top" | "bottom"; color: number }

export type GraphRow = { lane: number; color: number; segments: Segment[]; width: number }

export function layoutGraph(nodes: GraphNode[]): GraphRow[] {
  let lanes: (string | null)[] = []
  let laneColors: number[] = []
  let nextColor = 0
  const rows: GraphRow[] = []

  for (const node of nodes) {
    // Lanes coming down from the previous row, before this commit claims one.
    const incoming = [...lanes]
    let lane = lanes.indexOf(node.oid)
    if (lane === -1) {
      lane = lanes.indexOf(null)
      if (lane === -1) lane = lanes.length
      lanes[lane] = node.oid
      laneColors[lane] = nextColor++
    }
    const color = laneColors[lane] ?? 0
    const segments: Segment[] = []

    // Top half: every live lane enters this row; lanes waiting for this commit converge on it.
    incoming.forEach((waiting, index) => {
      if (waiting === null || waiting === undefined) return
      segments.push({
        fromLane: index,
        toLane: waiting === node.oid ? lane : index,
        half: "top",
        color: laneColors[index] ?? 0,
      })
    })

    const after = lanes.map((waiting) => (waiting === node.oid ? null : waiting))
    const afterColors = [...laneColors]
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

    after.forEach((waiting, index) => {
      if (waiting === null || waiting === undefined) return
      const passesThrough = index !== lane && incoming[index] === waiting
      if (index === lane || passesThrough) {
        segments.push({ fromLane: index, toLane: index, half: "bottom", color: afterColors[index] ?? 0 })
      }
    })

    while (after.length && after[after.length - 1] === null) after.pop()
    lanes = after
    laneColors = afterColors.slice(0, Math.max(after.length, 0))

    const used = segments.flatMap((s) => [s.fromLane, s.toLane]).concat(lane)
    rows.push({ lane, color, segments, width: Math.max(...used) + 1 })
  }
  return rows
}

export const laneColors = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#eab308", "#ef4444"]

export function laneColor(index: number): string {
  return laneColors[index % laneColors.length] ?? "#3b82f6"
}
