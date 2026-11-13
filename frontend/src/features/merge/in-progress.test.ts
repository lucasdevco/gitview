import { describe, expect, it } from "vitest"
import { inProgressNotice } from "./in-progress"

describe("inProgressNotice", () => {
  it("says nothing while no operation is in progress", () => {
    expect(inProgressNotice("clean", 0)).toBeUndefined()
  })

  it("shows a conflicted merge with its conflict count and offers to abort it", () => {
    expect(inProgressNotice("merging", 2)).toEqual({
      title: "合并中",
      detail: "有 2 个冲突文件。解决冲突后勾选文件标记为已解决，然后提交以完成合并。",
      abort: "abortMerge",
    })
  })

  it("asks to commit a merge once nothing is conflicted", () => {
    expect(inProgressNotice("merging", 0)).toMatchObject({
      detail: "没有冲突文件。提交以完成合并。",
      abort: "abortMerge",
    })
  })

  it("offers to abort a rebase, whose continuation happens outside gitview for now", () => {
    expect(inProgressNotice("rebasing", 1)).toEqual({
      title: "变基中",
      detail: "有 1 个冲突文件。解决冲突并标记为已解决后，在终端运行 git rebase --continue 继续。",
      abort: "abortRebase",
    })
    expect(inProgressNotice("rebasing", 0)?.detail).toBe("变基已暂停。在终端运行 git rebase --continue 继续。")
  })

  it("concludes a cherry-pick by committing and offers to abort it", () => {
    expect(inProgressNotice("cherry-picking", 1)).toEqual({
      title: "遴选中",
      detail: "有 1 个冲突文件。解决冲突后勾选文件标记为已解决，然后提交以完成遴选。",
      abort: "abortCherryPick",
    })
    expect(inProgressNotice("cherry-picking", 0)?.detail).toBe("没有冲突文件。提交以完成遴选。")
  })

  it("concludes a revert by committing and offers to abort it", () => {
    expect(inProgressNotice("reverting", 3)).toEqual({
      title: "反转中",
      detail: "有 3 个冲突文件。解决冲突后勾选文件标记为已解决，然后提交以完成反转。",
      abort: "abortRevert",
    })
    expect(inProgressNotice("reverting", 0)?.detail).toBe("没有冲突文件。提交以完成反转。")
  })
})
