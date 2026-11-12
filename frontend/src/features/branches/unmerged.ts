/**
 * The branches of `requested` that `git branch -d` refused to delete
 * because they are not fully merged, read from git's output (the
 * `branch_not_merged` error). The other requested branches were deleted.
 */
export function unmergedBranches(output: string, requested: readonly string[]): string[] {
  const refused = new Set(Array.from(output.matchAll(/branch '(.+?)' is not fully merged/gi), (match) => match[1]))
  return requested.filter((branch) => refused.has(branch))
}
