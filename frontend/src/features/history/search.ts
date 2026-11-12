import type { GraphCommit } from "@/lib/api/history"

/**
 * Commits whose message, author name or author email contains `query`
 * (ignoring case), or whose hash starts with it. A blank query keeps all.
 */
export function searchCommits(commits: GraphCommit[], query: string): GraphCommit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return commits
  return commits.filter(
    (commit) =>
      commit.oid.startsWith(needle) ||
      commit.subject.toLowerCase().includes(needle) ||
      commit.author.toLowerCase().includes(needle) ||
      commit.email.toLowerCase().includes(needle),
  )
}
