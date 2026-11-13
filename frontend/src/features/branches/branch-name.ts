// Live validation of new branch and tag names, following `git
// check-ref-format` for refs/heads/<name> and refs/tags/<name> (plus git
// branch's own refusals of "HEAD" and a leading "-"). The backend checks the
// same rules with git itself.

/**
 * Why `name` is not a valid ref name component path, as a short Chinese
 * message, or undefined when it is. Emptiness and existing names are left to
 * the caller.
 */
export function refNameProblem(name: string): string | undefined {
  if (name.includes(" ")) return "不能包含空格"
  // biome-ignore lint/suspicious/noControlCharactersInRegex: git forbids ASCII control characters
  if (/[\u0000-\u001f\u007f]/.test(name)) return "不能包含控制字符"
  if (/[~^:?*[\\]/.test(name)) return "不能包含 ~ ^ : ? * [ \\"
  if (name.includes("..")) return "不能包含“..”"
  if (name.includes("@{")) return "不能包含“@{”"
  if (name === "@") return "不能是“@”"
  if (name === "HEAD") return "不能是“HEAD”"
  if (name.startsWith("-")) return "不能以“-”开头"
  if (name.startsWith("/") || name.endsWith("/")) return "不能以“/”开头或结尾"
  if (name.includes("//")) return "不能包含连续的“/”"
  if (name.endsWith(".")) return "不能以“.”结尾"
  const components = name.split("/")
  if (components.some((component) => component.startsWith("."))) return "各级名称不能以“.”开头"
  if (components.some((component) => component.endsWith(".lock"))) return "各级名称不能以“.lock”结尾"
  return undefined
}

/**
 * Why `name` cannot be used for a new branch, as a short Chinese message,
 * or undefined when it can. `existing` are the local branch names.
 */
export function branchNameProblem(name: string, existing: readonly string[]): string | undefined {
  if (name === "") return "请输入分支名"
  const problem = refNameProblem(name)
  if (problem) return problem
  if (existing.includes(name)) return `已存在名为 ${name} 的分支`
  return undefined
}
