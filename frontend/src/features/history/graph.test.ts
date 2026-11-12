import { describe, expect, test } from "vitest"
import { type GraphNode, type GraphRow, layoutGraph, type Segment } from "./graph.ts"

const node = (oid: string, ...parents: string[]): GraphNode => ({ oid, parents })
const seg = (half: Segment["half"], fromLane: number, toLane: number, color: number): Segment => ({
  fromLane,
  toLane,
  half,
  color,
})
const sorted = (segments: Segment[]) =>
  [...segments].sort((a, b) =>
    `${a.half}${a.fromLane}${a.toLane}${a.color}`.localeCompare(`${b.half}${b.fromLane}${b.toLane}${b.color}`),
  )
const expectRow = (row: GraphRow | undefined, lane: number, color: number, width: number, segments: Segment[]) => {
  expect(row).toBeDefined()
  expect({ lane: row?.lane, color: row?.color, width: row?.width }).toEqual({ lane, color, width })
  expect(sorted(row?.segments ?? [])).toEqual(sorted(segments))
}

/**
 * Lanes must join up across row boundaries: what leaves a row at the bottom
 * enters the next row at the top, in the same lane and colour. This is what
 * keeps the graph continuous at any scroll position.
 */
function expectContinuous(rows: GraphRow[]) {
  rows.forEach((row, index) => {
    const next = rows[index + 1]
    const leaving = row.segments
      .filter((s) => s.half === "bottom")
      .map((s) => `${s.toLane}:${s.color}`)
      .sort()
    const entering = (next?.segments ?? [])
      .filter((s) => s.half === "top")
      .map((s) => `${s.fromLane}:${s.color}`)
      .sort()
    expect([...new Set(leaving)], `row ${index} → ${index + 1}`).toEqual(next ? entering : [])
  })
}

describe("layoutGraph", () => {
  test("a linear history stays in one lane", () => {
    const rows = layoutGraph([node("c", "b"), node("b", "a"), node("a")])
    expectRow(rows[0], 0, 0, 1, [seg("bottom", 0, 0, 0)])
    expectRow(rows[1], 0, 0, 1, [seg("top", 0, 0, 0), seg("bottom", 0, 0, 0)])
    expectRow(rows[2], 0, 0, 1, [seg("top", 0, 0, 0)])
  })

  test("a fork: a second branch tip opens a new lane that bends into its parent's lane", () => {
    const rows = layoutGraph([node("main", "base"), node("feature", "base"), node("base")])
    expectRow(rows[0], 0, 0, 1, [seg("bottom", 0, 0, 0)])
    expectRow(rows[1], 1, 1, 2, [seg("top", 0, 0, 0), seg("bottom", 1, 0, 0), seg("bottom", 0, 0, 0)])
    expectRow(rows[2], 0, 0, 1, [seg("top", 0, 0, 0)])
    expectContinuous(rows)
  })

  test("a merge commit opens a lane for its second parent that joins back at the common ancestor", () => {
    const rows = layoutGraph([node("merge", "main", "side"), node("main", "root"), node("side", "root"), node("root")])
    expectRow(rows[0], 0, 0, 2, [seg("bottom", 0, 0, 0), seg("bottom", 0, 1, 1)])
    expectRow(rows[1], 0, 0, 2, [
      seg("top", 0, 0, 0),
      seg("top", 1, 1, 1),
      seg("bottom", 0, 0, 0),
      seg("bottom", 1, 1, 1),
    ])
    expectRow(rows[2], 1, 1, 2, [
      seg("top", 0, 0, 0),
      seg("top", 1, 1, 1),
      seg("bottom", 1, 0, 0),
      seg("bottom", 0, 0, 0),
    ])
    expectRow(rows[3], 0, 0, 1, [seg("top", 0, 0, 0)])
    expectContinuous(rows)
  })

  test("several children converge on a shared parent in its lane", () => {
    const rows = layoutGraph([node("a", "p"), node("b", "q"), node("q", "p"), node("p")])
    expectRow(rows[3], 0, 0, 1, [seg("top", 0, 0, 0)])
    expectRow(rows[2], 1, 1, 2, [
      seg("top", 0, 0, 0),
      seg("top", 1, 1, 1),
      seg("bottom", 1, 0, 0),
      seg("bottom", 0, 0, 0),
    ])
    expectContinuous(rows)
  })

  test("an octopus merge opens one lane per extra parent, each with its own colour", () => {
    const rows = layoutGraph([node("octopus", "a", "b", "c"), node("a"), node("b"), node("c")])
    expectRow(rows[0], 0, 0, 3, [seg("bottom", 0, 0, 0), seg("bottom", 0, 1, 1), seg("bottom", 0, 2, 2)])
    expect(rows.map((row) => row.lane)).toEqual([0, 0, 1, 2])
    expect(rows.map((row) => row.color)).toEqual([0, 0, 1, 2])
    expectContinuous(rows)
  })

  test("a lane freed in the middle is reused by the next new branch tip, with a new colour", () => {
    const rows = layoutGraph([
      node("A", "P"),
      node("B", "Q"),
      node("C", "S"),
      node("Q", "P"), // lane 1 ends here, bending into P's lane
      node("D", "T"), // new tip takes the hole at lane 1
      node("P"),
      node("S"),
      node("T"),
    ])
    expect(rows.map((row) => row.lane)).toEqual([0, 1, 2, 1, 1, 0, 2, 1])
    expect(rows[4]?.color).toBe(3)
    expectRow(rows[4], 1, 3, 3, [
      seg("top", 0, 0, 0),
      seg("top", 2, 2, 2),
      seg("bottom", 0, 0, 0),
      seg("bottom", 1, 1, 3),
      seg("bottom", 2, 2, 2),
    ])
    expectContinuous(rows)
  })

  test("a merge whose second parent lands in the lane it frees emits each segment once", () => {
    const rows = layoutGraph([node("A", "P"), node("M", "P", "X"), node("P"), node("X")])
    expectRow(rows[1], 1, 1, 2, [
      seg("top", 0, 0, 0),
      seg("bottom", 1, 0, 0),
      seg("bottom", 1, 1, 2),
      seg("bottom", 0, 0, 0),
    ])
    expectContinuous(rows)
  })

  test("a parent outside the list keeps its lane open to the bottom", () => {
    const rows = layoutGraph([node("tip", "missing"), node("other")])
    expectRow(rows[1], 1, 1, 2, [seg("top", 0, 0, 0), seg("bottom", 0, 0, 0)])
  })

  test("lanes stay continuous through a large history of branches and merges", () => {
    // Deterministic pseudo-random DAG, newest first: each commit's parents are older commits.
    let seed = 7
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const count = 2000
    const nodes: GraphNode[] = []
    for (let index = 0; index < count; index++) {
      const parents: string[] = []
      const parentCount = index === count - 1 ? 0 : random() < 0.15 ? 2 : 1
      for (let p = 0; p < parentCount; p++) {
        const offset = 1 + Math.floor(random() * Math.min(12, count - 1 - index))
        const parent = `c${index + offset}`
        if (!parents.includes(parent)) parents.push(parent)
      }
      nodes.push(node(`c${index}`, ...parents))
    }
    const rows = layoutGraph(nodes)
    expect(rows).toHaveLength(count)
    expectContinuous(rows)
    for (const row of rows) {
      const keys = row.segments.map((s) => `${s.half}-${s.fromLane}-${s.toLane}`)
      expect(new Set(keys).size).toBe(keys.length)
      expect(row.width).toBeGreaterThan(Math.max(row.lane, ...row.segments.flatMap((s) => [s.fromLane, s.toLane])))
    }
  })
})
