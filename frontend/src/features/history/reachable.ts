// Which commits of the loaded history a commit's history contains, e.g.
// which commits HEAD already has (cherry-picking those would change nothing).

/**
 * The oids of `start` and all its ancestors among `commits`. The graph
 * always holds HEAD's whole history, so for HEAD this is exact.
 */
export function reachableFrom(
  commits: readonly { oid: string; parents: readonly string[] }[],
  start: string,
): Set<string> {
  const parents = new Map(commits.map((commit) => [commit.oid, commit.parents]))
  const reached = new Set<string>()
  const pending = start ? [start] : []
  for (let oid = pending.pop(); oid !== undefined; oid = pending.pop()) {
    if (reached.has(oid)) continue
    reached.add(oid)
    pending.push(...(parents.get(oid) ?? []))
  }
  return reached
}
