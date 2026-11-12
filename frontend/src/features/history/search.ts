import type { GraphCommit } from "@/lib/api/history"

/**
 * Commits whose subject, author name or author email contains `query`
 * (ignoring case), or whose hash starts with it, plus those in
 * `messageMatches`: the commits whose full message matched on the server
 * (see `commitSearchQuery`), since the graph carries only subjects. Keeps
 * the graph's order. A blank query keeps all.
 */
export function searchCommits(
  commits: GraphCommit[],
  query: string,
  messageMatches?: ReadonlySet<string>,
): GraphCommit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return commits
  return commits.filter(
    (commit) =>
      commit.oid.startsWith(needle) ||
      commit.subject.toLowerCase().includes(needle) ||
      commit.author.toLowerCase().includes(needle) ||
      commit.email.toLowerCase().includes(needle) ||
      messageMatches?.has(commit.oid) === true,
  )
}
