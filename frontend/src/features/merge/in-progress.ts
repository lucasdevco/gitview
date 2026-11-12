// What the workbench says about an operation the repository is in the
// middle of (RepoSummary.state), and how it can be abandoned.
import type { RepoState } from "@/lib/api/repos"

export type InProgressNotice = {
  /** Short name of the state, e.g. "合并中". */
  title: string
  /** The conflicts left and what to do next. */
  detail: string
  /** The operation that abandons it; absent when gitview cannot abort it yet. */
  abort?: "abortMerge" | "abortRebase"
}

const conflicts = (count: number) => `有 ${count} 个冲突文件。`

/** The banner for `state`, or undefined when the repository is clean. */
export function inProgressNotice(state: RepoState, conflictedCount: number): InProgressNotice | undefined {
  switch (state) {
    case "clean":
      return undefined
    case "merging":
      return {
        title: "合并中",
        detail: conflictedCount
          ? `${conflicts(conflictedCount)}解决冲突后勾选文件标记为已解决，然后提交以完成合并。`
          : "没有冲突文件。提交以完成合并。",
        abort: "abortMerge",
      }
    case "rebasing":
      return {
        title: "变基中",
        detail: conflictedCount
          ? `${conflicts(conflictedCount)}解决冲突并标记为已解决后，在终端运行 git rebase --continue 继续。`
          : "变基已暂停。在终端运行 git rebase --continue 继续。",
        abort: "abortRebase",
      }
    case "cherry-picking":
      return { title: "遴选中", detail: conflictedCount ? conflicts(conflictedCount) : "没有冲突文件。" }
    case "reverting":
      return { title: "还原中", detail: conflictedCount ? conflicts(conflictedCount) : "没有冲突文件。" }
  }
}
