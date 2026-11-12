// Choosing remotes and remote branches for the fetch, pull and push dialogs,
// the commit area's 立即推送 and the branch menu's 推送到 and 拿来.
import type { Branch, Refs, Remote } from "@/lib/api/history"
import type { PushBranch } from "@/lib/api/jobs"

/**
 * The remote an operation on one remote should use by default: the one the
 * current branch tracks, else origin, else the first configured remote.
 * Undefined when the repository has no remotes.
 */
export function defaultRemote(refs: Refs | undefined): string | undefined {
  const names = refs?.remotes.map((remote) => remote.name) ?? []
  const upstream = refs?.branches.find((branch) => branch.current)?.upstream ?? ""
  const tracked = upstream ? splitUpstream(upstream, refs?.remotes ?? [])?.remote : undefined
  return tracked && names.includes(tracked) ? tracked : names.includes("origin") ? "origin" : names.at(0)
}

/**
 * Splits a remote-tracking branch such as "origin/feature/x" into its
 * remote and the branch's name on that remote. Remote names may contain
 * "/", so the longest matching remote wins. Undefined when no configured
 * remote matches.
 */
export function splitUpstream(
  upstream: string,
  remotes: readonly Remote[],
): { remote: string; branch: string } | undefined {
  const remote = remotes
    .map((candidate) => candidate.name)
    .filter((name) => upstream.startsWith(`${name}/`))
    .sort((a, b) => b.length - a.length)
    .at(0)
  return remote === undefined ? undefined : { remote, branch: upstream.slice(remote.length + 1) }
}

/** Where a branch is pushed by default, and whether pushing should make it track. */
export type PushTarget = { remote: string; branch: PushBranch }

/**
 * Where pushing a local branch goes without asking: its upstream when it
 * tracks one; else the same name on the default remote, tracking it from
 * then on. Undefined without remotes.
 */
export function pushTarget(refs: Refs | undefined, local: string): PushTarget | undefined {
  const branch = refs?.branches.find((candidate) => candidate.name === local)
  const upstream =
    branch?.upstream && !branch.upstreamGone ? splitUpstream(branch.upstream, refs?.remotes ?? []) : undefined
  if (upstream) return { remote: upstream.remote, branch: { local, remote: upstream.branch } }
  const remote = defaultRemote(refs)
  return remote === undefined ? undefined : { remote, branch: { local, remote: local, track: true } }
}

/** "origin/main": a push target as Sourcetree names it. */
export function pushTargetName({ remote, branch }: PushTarget): string {
  return `${remote}/${branch.remote || branch.local}`
}

/**
 * The remote branch the 拉取 dialog proposes on `remote`: the one the current
 * branch tracks there, else the one with the current branch's name, else
 * the remote's first branch.
 */
export function defaultPullBranch(refs: Refs | undefined, remote: string): string | undefined {
  const current = refs?.branches.find((branch) => branch.current)
  const names =
    refs?.remotes.find((candidate) => candidate.name === remote)?.branches.map((branch) => branch.branch) ?? []
  const upstream = current?.upstream ? splitUpstream(current.upstream, refs?.remotes ?? []) : undefined
  if (upstream?.remote === remote && names.includes(upstream.branch)) return upstream.branch
  if (current && names.includes(current.name)) return current.name
  return names.at(0)
}

/** One row of the 推送 dialog's branch table. */
export type PushRow = {
  local: string
  /** The branch on the remote it goes to: its upstream there, else the same name. */
  remote: string
  /** 跟踪？ starts ticked for branches that track a branch on this remote. */
  track: boolean
}

/** What the user changed in a 推送 row: the remote branch typed, 跟踪？ toggled. */
export type PushRowEdit = { remote?: string; track?: boolean }

/**
 * The branch to push for a row and the user's edits. `-u` only where it
 * changes something: a branch already tracking the remote branch it is
 * pushed to keeps tracking without it.
 */
export function pushBranch(row: PushRow, edit: PushRowEdit): PushBranch {
  const remote = (edit.remote ?? row.remote).trim()
  const tracked = row.track && remote === row.remote
  return { local: row.local, remote, track: (edit.track ?? row.track) && !tracked }
}

/**
 * Why `name` cannot be pushed to as a remote branch, by the same rules as
 * the API: present, not starting with "-" or "+", without ":" or whitespace.
 */
export function remoteBranchProblem(name: string): string | undefined {
  const trimmed = name.trim()
  if (!trimmed) return "请输入远程分支名"
  if (/^[-+]/.test(trimmed) || /[:\s]/.test(trimmed))
    return `“${trimmed}”不是有效的分支名：不能以 - 或 + 开头，不能包含冒号或空白`
  return undefined
}

/** The 推送 dialog's rows for pushing to `remote`. */
export function pushRows(branches: readonly Branch[], remotes: readonly Remote[], remote: string): PushRow[] {
  return branches.map((branch) => {
    const upstream = branch.upstream ? splitUpstream(branch.upstream, remotes) : undefined
    const tracksHere = upstream?.remote === remote
    return { local: branch.name, remote: tracksHere ? upstream.branch : branch.name, track: tracksHere }
  })
}
