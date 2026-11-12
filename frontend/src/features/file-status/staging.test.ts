import { describe, expect, it } from "vitest"
import type { DiffHunk } from "@/features/diff/parse-diff"
import type { WorktreeStatus } from "@/lib/api/worktree"
import { canCommit, hunkOperations, hunkRequest, pendingFileCount, toggleRequest } from "./staging"

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
  it("stages unstaged and untracked files", () => {
    expect(
      toggleRequest("unstaged", [
        { path: "m.txt", status: "modified" },
        { path: "u.txt", status: "untracked" },
      ]),
    ).toEqual({ op: "stage", request: { paths: ["m.txt", "u.txt"] }, resolves: [] })
  })

  it("stages conflicted files too, naming them because staging marks their conflicts resolved", () => {
    expect(
      toggleRequest("unstaged", [
        { path: "c.txt", status: "conflicted" },
        { path: "m.txt", status: "modified" },
      ]),
    ).toEqual({ op: "stage", request: { paths: ["c.txt", "m.txt"] }, resolves: ["c.txt"] })
  })

  it("unstages both sides of a staged rename", () => {
    expect(
      toggleRequest("staged", [
        { path: "new.txt", oldPath: "old.txt", status: "renamed" },
        { path: "a.txt", status: "added" },
      ]),
    ).toEqual({ op: "unstage", request: { paths: ["new.txt", "old.txt", "a.txt"] }, resolves: [] })
  })

  it("has nothing to do without files", () => {
    expect(toggleRequest("staged", [])).toBeUndefined()
    expect(toggleRequest("unstaged", [])).toBeUndefined()
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

  it("concludes a merge without staged changes once no file is conflicted", () => {
    const merging = { ...ready, stagedCount: 0, merging: true }
    expect(canCommit(merging)).toBe(true)
    expect(canCommit({ ...merging, conflictedCount: 1 })).toBe(false)
    expect(canCommit({ ...merging, message: "" })).toBe(false)
  })

  it("cannot commit while files are conflicted", () => {
    expect(canCommit({ ...ready, conflictedCount: 2 })).toBe(false)
  })

  it("cannot amend before the first commit, but can make it", () => {
    expect(canCommit({ ...ready, empty: true })).toBe(true)
    expect(canCommit({ ...ready, empty: true, amend: true })).toBe(false)
  })
})

describe("hunk operations", () => {
  const hunk: DiffHunk = {
    index: 2,
    header: "@@ -15,6 +15,6 @@ func main() {",
    oldStart: 15,
    oldCount: 6,
    newStart: 15,
    newCount: 6,
    from: 15,
    to: 20,
    lines: [],
  }

  it("offers stage and discard for unstaged and untracked files, unstage for staged ones", () => {
    expect(hunkOperations("unstaged", { path: "m.txt", status: "modified" })).toEqual(["stageHunk", "discardHunk"])
    expect(hunkOperations("unstaged", { path: "u.txt", status: "untracked" })).toEqual(["stageHunk", "discardHunk"])
    expect(hunkOperations("staged", { path: "a.txt", status: "added" })).toEqual(["unstageHunk"])
  })

  it("leaves conflicted files to conflict resolution", () => {
    expect(hunkOperations("unstaged", { path: "c.txt", status: "conflicted" })).toEqual([])
  })

  it("identifies the hunk by its header range, with the rename's old path for staged files", () => {
    const range = { oldStart: 15, oldCount: 6, newStart: 15, newCount: 6 }
    const renamed = { path: "new.txt", oldPath: "old.txt", status: "renamed" } as const
    expect(hunkRequest(renamed, "staged", hunk)).toEqual({ path: "new.txt", oldPath: "old.txt", hunk: range })
    expect(hunkRequest({ path: "f.txt", status: "modified" }, "unstaged", hunk)).toEqual({ path: "f.txt", hunk: range })
  })
})
