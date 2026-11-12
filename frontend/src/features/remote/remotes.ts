// Choosing a remote for the fetch, pull and push dialogs.
import type { Refs } from "@/lib/api/history"

/**
 * The remote an operation on one remote should use by default: the one the
 * current branch tracks, else origin, else the first configured remote.
 * Undefined when the repository has no remotes.
 */
export function defaultRemote(refs: Refs | undefined): string | undefined {
  const names = refs?.remotes.map((remote) => remote.name) ?? []
  const upstream = refs?.branches.find((branch) => branch.current)?.upstream ?? ""
  // Remote names may contain "/", so the longest matching name wins.
  const tracked = names
    .filter((name) => upstream.startsWith(`${name}/`))
    .sort((a, b) => b.length - a.length)
    .at(0)
  return tracked ?? (names.includes("origin") ? "origin" : names.at(0))
}
