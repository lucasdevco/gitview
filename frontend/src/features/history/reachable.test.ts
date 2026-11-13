import { describe, expect, it } from "vitest"
import { reachableFrom } from "./reachable"

const commit = (oid: string, ...parents: string[]) => ({ oid, parents })

describe("reachableFrom", () => {
  // main: a - b - m (merge of b and t); topic: a - t; other: a - o
  const graph = [commit("m", "b", "t"), commit("o", "a"), commit("t", "a"), commit("b", "a"), commit("a")]

  it("includes the start and every ancestor through both parents of a merge", () => {
    expect([...reachableFrom(graph, "m")].sort()).toEqual(["a", "b", "m", "t"])
  })

  it("leaves out commits only other branches reach", () => {
    expect(reachableFrom(graph, "t").has("o")).toBe(false)
    expect(reachableFrom(graph, "t").has("b")).toBe(false)
  })

  it("is empty without a start, as in a repository without commits", () => {
    expect(reachableFrom(graph, "").size).toBe(0)
  })
})
