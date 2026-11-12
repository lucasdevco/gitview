import { expect, test } from "vitest"
import { createApiClient } from "./client"
import { diffRequestFor, getFileDiff } from "./worktree"

test("diff paths with reserved URL characters reach the server intact", async () => {
  const urls: string[] = []
  const client = createApiClient({
    fetch: async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify({ data: {} }), { status: 200 })
    },
  })
  await getFileDiff(client, "abc", { source: "staged", path: "新 目录/a&b#c?.txt", oldPath: "100%.txt" })

  const url = new URL(urls[0] ?? "", "http://127.0.0.1")
  expect(url.pathname).toBe("/api/v1/repos/abc/diff")
  expect(Object.fromEntries(url.searchParams)).toEqual({
    source: "staged",
    path: "新 目录/a&b#c?.txt",
    oldPath: "100%.txt",
  })
})

test("each status area asks for the matching diff source", () => {
  expect(diffRequestFor({ path: "b", oldPath: "a", status: "renamed" }, "staged")).toEqual({
    source: "staged",
    path: "b",
    oldPath: "a",
  })
  expect(diffRequestFor({ path: "m", status: "modified" }, "unstaged")).toEqual({ source: "unstaged", path: "m" })
  expect(diffRequestFor({ path: "n", status: "untracked" }, "unstaged")).toEqual({ source: "untracked", path: "n" })
  expect(diffRequestFor({ path: "c", status: "conflicted" }, "unstaged")).toEqual({ source: "unstaged", path: "c" })
})
