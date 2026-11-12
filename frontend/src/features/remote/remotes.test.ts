import { expect, test } from "vitest"
import type { Branch, Refs } from "@/lib/api/history"
import { defaultPullBranch, defaultRemote, pushRows, pushTarget, pushTargetName, splitUpstream } from "./remotes"

const branch = (name: string, fields: Partial<Branch> = {}): Branch => ({
  name,
  oid: "a",
  current: false,
  upstream: "",
  ahead: 0,
  behind: 0,
  upstreamGone: false,
  ...fields,
})

const refs = (remotes: string[], upstream = ""): Refs => ({
  branches: [branch("main", { current: true, upstream }), branch("other", { upstream: "zeta/other" })],
  remotes: remotes.map((name) => ({ name, url: "", branches: [] })),
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

test("an upstream splits into its remote, the longest that matches, and the branch there", () => {
  const remotes = refs(["team", "team/fork"]).remotes
  expect(splitUpstream("team/fork/feature/x", remotes)).toEqual({ remote: "team/fork", branch: "feature/x" })
  expect(splitUpstream("team/main", remotes)).toEqual({ remote: "team", branch: "main" })
  expect(splitUpstream("gone/main", remotes)).toBeUndefined()
})

test("a tracking branch pushes to its upstream; others to the same name on the default remote, tracking it", () => {
  const tracking: Refs = {
    ...refs(["origin", "fork"]),
    branches: [branch("main", { current: true, upstream: "fork/trunk" }), branch("new")],
  }
  const toUpstream = pushTarget(tracking, "main")
  expect(toUpstream).toEqual({ remote: "fork", branch: { local: "main", remote: "trunk" } })
  expect(toUpstream && pushTargetName(toUpstream)).toBe("fork/trunk")
  expect(pushTarget(tracking, "new")).toEqual({ remote: "fork", branch: { local: "new", remote: "new", track: true } })
  expect(pushTarget(refs([]), "main")).toBeUndefined()
})

test("a branch whose upstream is gone is pushed like one that tracks nothing", () => {
  const gone: Refs = { ...refs(["origin"]), branches: [branch("main", { upstream: "origin/old", upstreamGone: true })] }
  expect(pushTarget(gone, "main")).toEqual({ remote: "origin", branch: { local: "main", remote: "main", track: true } })
})

test("pull proposes the tracked branch, else the same name, else the remote's first branch", () => {
  const remoteBranch = (name: string) => ({ name: `origin/${name}`, branch: name, oid: "b" })
  const pulling = (upstream: string, names: string[]): Refs => ({
    ...refs([], upstream),
    remotes: [{ name: "origin", url: "", branches: names.map(remoteBranch) }],
  })
  expect(defaultPullBranch(pulling("origin/trunk", ["main", "trunk"]), "origin")).toBe("trunk")
  expect(defaultPullBranch(pulling("", ["develop", "main"]), "origin")).toBe("main")
  expect(defaultPullBranch(pulling("", ["develop"]), "origin")).toBe("develop")
  expect(defaultPullBranch(pulling("", []), "origin")).toBeUndefined()
})

test("push rows go to each branch's upstream on that remote and start tracked only there", () => {
  const remotes = refs(["origin", "fork"]).remotes
  const branches = [
    branch("main", { upstream: "origin/trunk" }),
    branch("topic", { upstream: "fork/topic" }),
    branch("new"),
  ]
  expect(pushRows(branches, remotes, "origin")).toEqual([
    { local: "main", remote: "trunk", track: true },
    { local: "topic", remote: "topic", track: false },
    { local: "new", remote: "new", track: false },
  ])
})
