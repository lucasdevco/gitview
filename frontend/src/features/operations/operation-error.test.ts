import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/client"
import { describeOperationError } from "./operation-error"

const checkoutOutput = `error: Your local changes to the following files would be overwritten by checkout:
\ta.txt
Please commit your changes or stash them before you switch branches.
Aborting`

describe("describeOperationError", () => {
  it("explains local changes that block a checkout and shows git's own output", () => {
    const error = new ApiError(409, "local_changes", "git switch other: ...", { output: checkoutOutput })
    expect(describeOperationError(error)).toEqual({
      summary: "本地改动会被覆盖",
      advice: "请先提交或贮藏这些改动，然后重试。",
      output: checkoutOutput,
    })
  })

  it("falls back to the error message when git printed nothing", () => {
    const error = new ApiError(0, "network_error", "无法连接 gitview 服务。")
    expect(describeOperationError(error)).toEqual({ summary: "操作失败", output: "无法连接 gitview 服务。" })
    expect(describeOperationError(new Error("boom"))).toEqual({ summary: "操作失败", output: "boom" })
  })

  it("names the other common git failures", () => {
    const summary = (code: string) => describeOperationError(new ApiError(409, code, "m", { output: "o" })).summary
    expect(summary("ref_not_found")).toBe("找不到指定的分支或提交")
    expect(summary("lock_conflict")).toBe("仓库正被其他 git 进程使用")
    expect(summary("hook_failed")).toBe("仓库的 hook 拒绝了此操作")
    expect(summary("branch_not_merged")).toBe("分支尚未完全合并")
    expect(summary("git_failed")).toBe("操作失败")
  })
})
