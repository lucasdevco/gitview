import { describe, expect, test } from "vitest"
import { type GraphNode, layoutGraph } from "./graph.ts"
import { UNCOMMITTED, withUncommittedChanges } from "./uncommitted.ts"

const node = (oid: string, ...parents: string[]): GraphNode => ({ oid, parents })

describe("withUncommittedChanges", () => {
  test("puts a virtual node whose parent is HEAD above every commit", () => {
    const commits = [node("c", "b"), node("b")]
    expect(withUncommittedChanges(commits, "c")).toEqual([{ oid: UNCOMMITTED, parents: ["c"] }, ...commits])
  })

  test("in a repository without commits the virtual node has no parent", () => {
    expect(withUncommittedChanges([], "")).toEqual([{ oid: UNCOMMITTED, parents: [] }])
  })

  test("the sentinel can never be mistaken for a commit id", () => {
    expect(UNCOMMITTED).not.toMatch(/^[0-9a-f]+$/)
  })
})

describe("uncommitted changes in the lane layout", () => {
  test("on top of HEAD it shares HEAD's lane and colour", () => {
    const rows = layoutGraph(withUncommittedChanges([node("head", "base"), node("base")], "head"))
    expect(rows.map((row) => ({ lane: row.lane, color: row.color, width: row.width }))).toEqual([
      { lane: 0, color: 0, width: 1 },
      { lane: 0, color: 0, width: 1 },
      { lane: 0, color: 0, width: 1 },
    ])
    expect(rows[0]?.segments).toEqual([{ fromLane: 0, toLane: 0, half: "bottom", color: 0 }])
    expect(rows[1]?.segments).toContainEqual({ fromLane: 0, toLane: 0, half: "top", color: 0 })
  })

  test("when a newer branch tip is above HEAD, the tip moves to a second lane and HEAD stays under the virtual node", () => {
    const commits = [node("feature", "head"), node("head", "base"), node("base")]
    const rows = layoutGraph(withUncommittedChanges(commits, "head"))

    expect(rows.map((row) => row.lane)).toEqual([0, 1, 0, 0])
    // The virtual node's line runs straight down past the branch tip to HEAD.
    expect(rows[1]?.segments).toContainEqual({ fromLane: 0, toLane: 0, half: "top", color: 0 })
    expect(rows[1]?.segments).toContainEqual({ fromLane: 0, toLane: 0, half: "bottom", color: 0 })
    // The branch tip bends into HEAD's lane instead of opening another one.
    expect(rows[1]?.segments).toContainEqual({ fromLane: 1, toLane: 0, half: "bottom", color: 0 })
    expect(rows[2]?.segments).toEqual([
      { fromLane: 0, toLane: 0, half: "top", color: 0 },
      { fromLane: 0, toLane: 0, half: "bottom", color: 0 },
    ])
  })

  test("with HEAD on a side branch, the virtual node's lane leads to HEAD and other lanes pass by", () => {
    const commits = [node("main", "base"), node("side", "base"), node("base")]
    const rows = layoutGraph(withUncommittedChanges(commits, "side"))

    // `main` takes a new lane while lane 0 keeps waiting for `side`; `side` then joins `main`'s lane at `base`.
    expect(rows.map((row) => row.lane)).toEqual([0, 1, 0, 1])
    expect(rows[1]?.segments).toContainEqual({ fromLane: 0, toLane: 0, half: "top", color: 0 })
    expect(rows[1]?.segments).toContainEqual({ fromLane: 0, toLane: 0, half: "bottom", color: 0 })
    expect(rows[2]?.segments).toContainEqual({ fromLane: 0, toLane: 0, half: "top", color: 0 })
    expect(rows[2]?.segments).toContainEqual({ fromLane: 0, toLane: 1, half: "bottom", color: 1 })
  })
})
