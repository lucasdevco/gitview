import { describe, expect, it } from "vitest"
import type { WorktreeStatus } from "@/lib/api/worktree"
import { canCommit, pendingFileCount, toggleRequest } from "./staging"

describe("pendingFileCount", () => {
  it("counts each changed path once, however many lists it appears in", () => {
    const status: WorktreeStatus = {
      staged: [
        { path: "both.txt", status: "modified" },
        { path: "new.txt", oldPath: "old.txt", status: "renamed" },
      ],
      unstaged: [{ path: "both.txt", status: "modified" }],
      untracked: [{ path: "u.txt", status: "untracked" }],
      conflicted: [{ path: "c.txt", status: "conflicted" }],
    }
    expect(pendingFileCount(status)).toBe(4)
    expect(pendingFileCount(undefined)).toBe(0)
  })
})

describe("toggleRequest", () => {
  it("stages unstaged and untracked files, leaving conflicts for conflict resolution", () => {
    expect(
      toggleRequest("unstaged", [
        { path: "m.txt", status: "modified" },
        { path: "u.txt", status: "untracked" },
        { path: "c.txt", status: "conflicted" },
      ]),
    ).toEqual({ op: "stage", request: { paths: ["m.txt", "u.txt"] } })
  })

  it("unstages both sides of a staged rename", () => {
    expect(
      toggleRequest("staged", [
        { path: "new.txt", oldPath: "old.txt", status: "renamed" },
        { path: "a.txt", status: "added" },
      ]),
    ).toEqual({ op: "unstage", request: { paths: ["new.txt", "old.txt", "a.txt"] } })
  })

  it("has nothing to do when no file can be toggled", () => {
    expect(toggleRequest("unstaged", [{ path: "c.txt", status: "conflicted" }])).toBeUndefined()
    expect(toggleRequest("staged", [])).toBeUndefined()
  })
})

describe("canCommit", () => {
  const ready = { stagedCount: 1, message: "Fix", amend: false, empty: false }

  it("needs staged changes and a message", () => {
    expect(canCommit(ready)).toBe(true)
    expect(canCommit({ ...ready, stagedCount: 0 })).toBe(false)
    expect(canCommit({ ...ready, message: "  \n " })).toBe(false)
  })

  it("lets an amend reword the last commit without staged changes", () => {
    expect(canCommit({ ...ready, stagedCount: 0, amend: true })).toBe(true)
  })

  it("cannot amend before the first commit, but can make it", () => {
    expect(canCommit({ ...ready, empty: true })).toBe(true)
    expect(canCommit({ ...ready, empty: true, amend: true })).toBe(false)
  })
})
