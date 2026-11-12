import { expect, test } from "vitest"
import { createApiClient } from "./client"
import { commitDiffRequest, getCommit } from "./commits"
import { getFileDiff } from "./worktree"

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

test("commit details are read from the commit's own resource", async () => {
  const { client, urls } = recordingClient()
  await getCommit(client, "abc", "0123456789abcdef")
  expect(urls[0]?.pathname).toBe("/api/v1/repos/abc/commits/0123456789abcdef")
})

test("a file of a commit asks for the commit diff source with the commit and both names of a rename", async () => {
  const { client, urls } = recordingClient()
  const request = commitDiffRequest("0123abcd", { path: "新/b&c.txt", oldPath: "a.txt", status: "renamed" })
  await getFileDiff(client, "abc", request)

  expect(urls[0]?.pathname).toBe("/api/v1/repos/abc/diff")
  expect(Object.fromEntries(urls[0]?.searchParams ?? [])).toEqual({
    source: "commit",
    commit: "0123abcd",
    path: "新/b&c.txt",
    oldPath: "a.txt",
  })
})
