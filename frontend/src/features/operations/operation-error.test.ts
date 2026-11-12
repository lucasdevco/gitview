import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/client"
import { describeOperationError, isConflict } from "./operation-error"

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
    expect(summary("conflict")).toBe("出现冲突")
    expect(summary("nothing_in_progress")).toBe("没有进行中的合并或变基")
  })

  it("names and advises on every kind of git failure the API reports", () => {
    // The error kinds in internal/git/errors.go.
    const kinds = [
      "git_not_installed",
      "not_a_repository",
      "lock_conflict",
      "authentication_failed",
      "conflict",
      "ref_not_found",
      "push_rejected",
      "unsupported_git_version",
      "hook_failed",
      "local_changes",
      "branch_not_merged",
      "nothing_in_progress",
      "git_failed",
    ]
    for (const kind of kinds) {
      const described = describeOperationError(new ApiError(500, kind, "m", { output: "o" }))
      expect(described.advice, kind).toBeTruthy()
      if (kind !== "git_failed") expect(described.summary, kind).not.toBe("操作失败")
    }
  })

  it("shows the API's hint for an error it has no copy for", () => {
    const error = new ApiError(500, "something_new", "m", { output: "o", hint: "do the thing" })
    expect(describeOperationError(error)).toEqual({ summary: "操作失败", advice: "do the thing", output: "o" })
  })

  it("suggests pulling first when the remote rejected a push", () => {
    const output = ` ! [rejected]        main -> main (fetch first)
error: failed to push some refs to '../origin'`
    expect(describeOperationError(new ApiError(409, "push_rejected", "m", { output }))).toEqual({
      summary: "远程仓库拒绝了推送",
      advice: "远程分支上有您本地没有的提交（或远程 hook 拒绝了推送）。请先拉取并整合这些提交，然后再推送。",
      output,
    })
  })

  it("explains failed authentication", () => {
    const output = "fatal: Authentication failed for 'https://example.com/repo.git/'"
    expect(describeOperationError(new ApiError(500, "authentication_failed", "m", { output }))).toEqual({
      summary: "远程仓库认证失败",
      advice: "请检查用户名和密码（或访问令牌）、SSH 密钥，然后重试；在凭据对话框中点“取消”也会导致认证失败。",
      output,
    })
  })
})

describe("isConflict", () => {
  it("recognises a merge or rebase that stopped on conflicts", () => {
    expect(isConflict(new ApiError(409, "conflict", "m"))).toBe(true)
    expect(isConflict(new ApiError(409, "local_changes", "m"))).toBe(false)
    expect(isConflict(new Error("conflict"))).toBe(false)
  })
})
