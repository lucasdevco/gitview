// Live validation of new tag names (git check-ref-format for
// refs/tags/<name>); the backend checks the same rules with git itself.
import { refNameProblem } from "@/features/branches/branch-name"

/**
 * Why `name` cannot be used for a new tag, as a short Chinese message, or
 * undefined when it can. `existing` are the tag names.
 */
export function tagNameProblem(name: string, existing: readonly string[]): string | undefined {
  if (name === "") return "请输入标签名"
  const problem = refNameProblem(name)
  if (problem) return problem
  if (existing.includes(name)) return `已存在名为 ${name} 的标签`
  return undefined
}
