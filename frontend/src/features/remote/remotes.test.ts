import { expect, test } from "vitest"
import type { Refs } from "@/lib/api/history"
import { defaultRemote } from "./remotes"

const refs = (remotes: string[], upstream = ""): Refs => ({
  branches: [
    { name: "main", oid: "a", current: true, upstream, ahead: 0, behind: 0, upstreamGone: false },
    { name: "other", oid: "b", current: false, upstream: "zeta/other", ahead: 0, behind: 0, upstreamGone: false },
  ],
  remotes: remotes.map((name) => ({ name, branches: [] })),
  tags: [],
})

test("the default remote is the one the current branch tracks", () => {
  expect(defaultRemote(refs(["origin", "team/fork"], "team/fork/main"))).toBe("team/fork")
  expect(defaultRemote(refs(["origin", "upstream"], "upstream/main"))).toBe("upstream")
})

test("without a tracked remote it is origin, else the first remote", () => {
  expect(defaultRemote(refs(["fork", "origin"]))).toBe("origin")
  expect(defaultRemote(refs(["fork", "zeta"]))).toBe("fork")
  expect(defaultRemote(refs([]))).toBeUndefined()
  expect(defaultRemote(undefined)).toBeUndefined()
})
