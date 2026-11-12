import { describe, expect, it } from "vitest"
import { unmergedBranches } from "./unmerged"

describe("unmergedBranches", () => {
  it("lists the requested branches git refused to delete, in request order", () => {
    const output = `error: the branch 'wip' is not fully merged
hint: If you are sure you want to delete it, run 'git branch -D wip'
error: the branch 'feature/x' is not fully merged
hint: If you are sure you want to delete it, run 'git branch -D feature/x'`
    expect(unmergedBranches(output, ["feature/x", "merged", "wip"])).toEqual(["feature/x", "wip"])
  })

  it("reads older git's wording too", () => {
    const output = `error: The branch 'wip' is not fully merged.
If you are sure you want to delete it, run 'git branch -D wip'.`
    expect(unmergedBranches(output, ["wip"])).toEqual(["wip"])
  })

  it("ignores names that were not requested and output without the message", () => {
    expect(unmergedBranches("error: the branch 'other' is not fully merged", ["wip"])).toEqual([])
    expect(unmergedBranches("fatal: something else", ["wip"])).toEqual([])
  })
})
