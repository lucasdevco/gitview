import { expect, test } from "vitest"
import type { GraphCommit } from "@/lib/api/history"
import { searchCommits } from "./search.ts"

const commit = (oid: string, subject: string, author: string, email: string): GraphCommit => ({
  oid,
  parents: [],
  author,
  email,
  authorTime: 0,
  commitTime: 0,
  subject,
})

const commits = [
  commit("a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", "Fix login redirect", "Ada Lovelace", "ada@example.com"),
  commit("ffee00112233445566778899aabbccddeeff0011", "Add graph view", "Grace Hopper", "grace@navy.mil"),
  commit("0011223344556677889900aabbccddeeff001122", "合并登录功能", "李雷", "lilei@example.cn"),
]
const oidsOf = (query: string) => searchCommits(commits, query).map((c) => c.oid.slice(0, 4))

test("an empty query keeps every commit", () => {
  expect(oidsOf("  ")).toEqual(["a1b2", "ffee", "0011"])
})

test("matches the commit message, ignoring case", () => {
  expect(oidsOf("LOGIN")).toEqual(["a1b2"])
  expect(oidsOf("登录")).toEqual(["0011"])
})

test("matches the author name or email", () => {
  expect(oidsOf("grace")).toEqual(["ffee"])
  expect(oidsOf("navy.mil")).toEqual(["ffee"])
  expect(oidsOf("李")).toEqual(["0011"])
})

test("matches a hash prefix, not a hash substring", () => {
  expect(oidsOf("A1B2C3")).toEqual(["a1b2"])
  expect(oidsOf("b2c3d4")).toEqual([])
})
