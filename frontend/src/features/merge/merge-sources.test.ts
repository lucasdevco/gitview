import { describe, expect, it } from "vitest"
import type { Refs } from "@/lib/api/history"
import { mergeSources } from "./merge-sources"

const branch = (name: string, current = false) => ({
  name,
  oid: "1",
  current,
  upstream: "",
  ahead: 0,
  behind: 0,
  upstreamGone: false,
})

describe("mergeSources", () => {
  it("lists local then remote-tracking branches, leaving out the current branch", () => {
    const refs: Refs = {
      branches: [branch("main", true), branch("feature/login"), branch("hotfix")],
      remotes: [
        { name: "origin", url: "", branches: [{ name: "origin/main", branch: "main", oid: "2" }] },
        { name: "fork", url: "", branches: [{ name: "fork/topic", branch: "topic", oid: "3" }] },
      ],
      tags: [{ name: "v1", oid: "4" }],
    }
    expect(mergeSources(refs)).toEqual(["feature/login", "hotfix", "origin/main", "fork/topic"])
  })

  it("has nothing to offer before the refs load", () => {
    expect(mergeSources(undefined)).toEqual([])
  })
})
