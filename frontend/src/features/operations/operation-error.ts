// What to tell the user about a failed write operation: a short summary of
// the failure class, advice on what to do, and git's own output.
import { ApiError } from "@/lib/api/client"

export type OperationErrorDescription = {
  /** One line naming what went wrong. */
  summary: string
  /** What to do about it, when there is something specific to suggest. */
  advice?: string
  /** What git printed, or the error message when it printed nothing. */
  output: string
}

const KNOWN: Record<string, Omit<OperationErrorDescription, "output">> = {
  local_changes: { summary: "本地改动会被覆盖", advice: "请先提交或贮藏这些改动，然后重试。" },
  branch_not_merged: { summary: "分支尚未完全合并", advice: "确认不再需要只在这些分支上的提交后，可以强制删除。" },
  ref_not_found: { summary: "找不到指定的分支或提交" },
  lock_conflict: {
    summary: "仓库正被其他 git 进程使用",
    advice: "等其他 git 操作结束后重试；若没有其他 git 进程在运行，可删除 .git/index.lock。",
  },
  hook_failed: { summary: "仓库的 hook 拒绝了此操作", advice: "修复 hook 报告的问题后重试。" },
  conflict: { summary: "出现冲突", advice: "在“文件状态”中解决冲突文件，或中止操作。" },
  nothing_in_progress: { summary: "没有进行中的合并或变基", advice: "它可能已在别处完成或中止。" },
  push_rejected: {
    summary: "远程仓库拒绝了推送",
    advice: "远程分支上有您本地没有的提交（或远程 hook 拒绝了推送）。请先拉取并整合这些提交，然后再推送。",
  },
  authentication_failed: {
    summary: "远程仓库认证失败",
    advice: "请检查用户名和密码（或访问令牌）、SSH 密钥，然后重试；在凭据对话框中点“取消”也会导致认证失败。",
  },
}

/**
 * Whether a merge or rebase stopped on conflicts. The repository is then
 * merging or rebasing, which the workbench shows; it is not a failure.
 */
export function isConflict(error: Error): boolean {
  return error instanceof ApiError && error.code === "conflict"
}

export function describeOperationError(error: Error): OperationErrorDescription {
  const apiError = error instanceof ApiError ? error : undefined
  const known = apiError ? KNOWN[apiError.code] : undefined
  return { summary: "操作失败", ...known, output: apiError?.output || error.message }
}
