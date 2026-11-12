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
}

export function describeOperationError(error: Error): OperationErrorDescription {
  const apiError = error instanceof ApiError ? error : undefined
  const known = apiError ? KNOWN[apiError.code] : undefined
  return { summary: "操作失败", ...known, output: apiError?.output || error.message }
}
