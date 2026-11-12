import { expect, test } from "vitest"
import { createApiClient } from "./client"
import { getStash, listStashes, stashDiffRequest } from "./stashes"
import { getFileDiff, worktreeKeys } from "./worktree"

function recordingClient() {
  const urls: URL[] = []
  const client = createApiClient({
    fetch: async (input) => {
      urls.push(new URL(String(input), "http://127.0.0.1"))
      return new Response(JSON.stringify({ data: {} }), { status: 200 })
    },
  })
  return { client, urls }
}

test("the stash list and one stash are read by index", async () => {
  const { client, urls } = recordingClient()
  await listStashes(client, "abc")
  await getStash(client, "abc", 2)
  expect(urls.map((url) => url.pathname)).toEqual(["/api/v1/repos/abc/stashes", "/api/v1/repos/abc/stashes/2"])
})

test("a file of a stash asks for the stash diff source with the stash's oid", async () => {
  const { client, urls } = recordingClient()
  await getFileDiff(client, "abc", stashDiffRequest("0123abcd", { path: "新 目录/u.txt", status: "untracked" }))

  expect(urls[0]?.pathname).toBe("/api/v1/repos/abc/diff")
  expect(Object.fromEntries(urls[0]?.searchParams ?? [])).toEqual({
    source: "stash",
    commit: "0123abcd",
    path: "新 目录/u.txt",
  })
})

test("stash diffs of different stashes have different keys", () => {
  const file = { path: "a.txt", status: "modified" } as const
  expect(worktreeKeys.diff("r", stashDiffRequest("aaa", file))).not.toEqual(
    worktreeKeys.diff("r", stashDiffRequest("bbb", file)),
  )
})
