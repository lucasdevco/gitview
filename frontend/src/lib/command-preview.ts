// Command previews: the git command an operation will run, rendered exactly
// as the backend reports it in the command log (internal/git/command.go
// Command.String and the builders in internal/repo/ops). Each builder takes
// the operation's request body, so a dialog can show the preview of what it
// is about to send.
//
// Adding an operation: add a builder here next to its request type and a
// vitest case using the string the backend's API test expects.

import type { FetchIntoRequest, FetchRequest, PullRequest, PushBranch, PushRequest } from "@/lib/api/jobs"
import type {
  CheckoutRequest,
  CherryPickRequest,
  CommitRequest,
  CreateBranchRequest,
  CreateTagRequest,
  DeleteBranchesRequest,
  MergeRequest,
  RebaseRequest,
  RenameBranchRequest,
  ResetRequest,
  RevertRequest,
  SetUpstreamRequest,
  StashPushRequest,
  StashRequest,
} from "@/lib/api/operations"

/** Renders `git <args...>` the way a user would type it in a POSIX shell. */
export function formatGitCommand(args: readonly string[]): string {
  return ["git", ...args.map(shellQuote)].join(" ")
}

// Marks a placeholder argument; a private-use character no real name has.
const PLACEHOLDER_MARK = "\u{F0000}"

/**
 * An argument the user has not entered yet, such as the new branch name,
 * for a preview: rendered as `<label>`, without quotes.
 */
export function placeholder(label: string): string {
  return PLACEHOLDER_MARK + label
}

const SAFE_ARGUMENT = /^[A-Za-z0-9_@%+=:,./^~-]+$/

function shellQuote(arg: string): string {
  if (arg.startsWith(PLACEHOLDER_MARK)) return `<${arg.slice(PLACEHOLDER_MARK.length)}>`
  if (arg === "") return "''"
  if (SAFE_ARGUMENT.test(arg)) return arg
  return `'${arg.replaceAll("'", `'\\''`)}'`
}

/** A pathspec matching only `path`, so `*`, `?` and `[` are not globs. */
const literal = (path: string) => `:(literal)${path}`

/** `stage`: add files' current content to the index. */
export function stageCommand(paths: readonly string[]): string {
  return formatGitCommand(["add", "--", ...paths.map(literal)])
}

/** `unstage`: reset files' index entries to HEAD. */
export function unstageCommand(paths: readonly string[]): string {
  return formatGitCommand(["reset", "--quiet", "--", ...paths.map(literal)])
}

/** `commit`: record the staged changes. */
export function commitCommand({ message, amend, noVerify }: CommitRequest): string {
  return formatGitCommand([
    "commit",
    ...(amend ? ["--amend"] : []),
    ...(noVerify ? ["--no-verify"] : []),
    "-m",
    message,
  ])
}

// The hunk operations pipe a patch of the one hunk into git apply, so the
// command is the same whichever hunk is chosen.

/** `stageHunk`: add one hunk to the index. */
export function stageHunkCommand(): string {
  return formatGitCommand(["apply", "--cached"])
}

/** `unstageHunk`: remove one hunk from the index. */
export function unstageHunkCommand(): string {
  return formatGitCommand(["apply", "--cached", "-R"])
}

/** `discardHunk`: revert one hunk in the working tree. */
export function discardHunkCommand(): string {
  return formatGitCommand(["apply", "-R"])
}

/** `checkout`: switch to a local branch, or detach HEAD at a commit. */
export function checkoutCommand(request: CheckoutRequest): string {
  if (request.commit !== undefined) return formatGitCommand(["switch", "--detach", request.commit])
  return formatGitCommand(["switch", request.branch])
}

/** `createBranch`: a new branch at the start point (default HEAD), switched to when `checkout`. */
export function createBranchCommand({ name, startPoint, checkout }: CreateBranchRequest): string {
  return formatGitCommand([...(checkout ? ["switch", "-c"] : ["branch"]), name, ...(startPoint ? [startPoint] : [])])
}

/** `deleteBranches`: `-d` refuses unmerged branches, `-D` (force) does not. */
export function deleteBranchesCommand({ branches, force }: DeleteBranchesRequest): string {
  return formatGitCommand(["branch", force ? "-D" : "-d", ...branches])
}

/** `renameBranch`. */
export function renameBranchCommand({ branch, newName }: RenameBranchRequest): string {
  return formatGitCommand(["branch", "-m", branch, newName])
}

/** `setUpstream`: make a branch track another (usually remote-tracking) branch. */
export function setUpstreamCommand({ branch, upstream }: SetUpstreamRequest): string {
  return formatGitCommand(["branch", `--set-upstream-to=${upstream}`, branch])
}

/** `stashPush`: stash every change, untracked files included. */
export function stashPushCommand({ message, keepIndex }: StashPushRequest): string {
  const trimmed = message?.trim() ?? ""
  return formatGitCommand([
    "stash",
    "push",
    "--include-untracked",
    ...(keepIndex ? ["--keep-index"] : []),
    ...(trimmed ? ["-m", trimmed] : []),
  ])
}

/** `stashApply`: apply a stash and keep it. */
export function stashApplyCommand({ index }: StashRequest): string {
  return formatGitCommand(["stash", "apply", `stash@{${index}}`])
}

/** `stashDrop`: delete a stash. */
export function stashDropCommand({ index }: StashRequest): string {
  return formatGitCommand(["stash", "drop", `stash@{${index}}`])
}

// Jobs ask git for progress, which it prints only to a terminal otherwise.

/** `fetch` (a job): download from all remotes, one remote, or git's default remote. */
export function fetchCommand({ all, remote, prune, tags }: FetchRequest): string {
  return formatGitCommand([
    "fetch",
    "--progress",
    ...(all ? ["--all"] : []),
    ...(remote ? [remote] : []),
    ...(prune ? ["--prune"] : []),
    ...(tags ? ["--tags"] : []),
  ])
}

/** `pull` (a job): fetch a remote branch and merge it into, or rebase, the current branch. */
export function pullCommand({ remote, branch, rebase, noCommit, log, noFastForward }: PullRequest): string {
  return formatGitCommand([
    "pull",
    "--progress",
    ...(rebase
      ? ["--rebase"]
      : [
          "--no-rebase",
          ...(noFastForward ? ["--no-ff"] : []),
          ...(log ? ["--log"] : []),
          ...(noCommit ? ["--no-commit"] : []),
        ]),
    ...(remote ? [remote] : []),
    ...(branch ? [branch] : []),
  ])
}

/**
 * `push` (a job): the commands it runs, in order. Branches that will track
 * go in one command with `-u`, the others in a second; tags go with the first.
 */
export function pushCommands({ remote, branches, tags }: PushRequest): string[] {
  const refspec = (branch: PushBranch) => `${branch.local}:${branch.remote || branch.local}`
  const groups = [
    { track: true, refspecs: branches.filter((branch) => branch.track).map(refspec) },
    { track: false, refspecs: branches.filter((branch) => !branch.track).map(refspec) },
  ]
  let withTags = !!tags
  const commands: string[] = []
  for (const { track, refspecs } of groups) {
    if (refspecs.length === 0 && !withTags) continue
    commands.push(
      formatGitCommand([
        "push",
        "--progress",
        ...(track && refspecs.length > 0 ? ["-u"] : []),
        ...(withTags ? ["--tags"] : []),
        remote,
        ...refspecs,
      ]),
    )
    withTags = false
  }
  return commands
}

/** `fetchInto` (a job, 拿来): fast-forward a branch that is not checked out. */
export function fetchIntoCommand({ remote, branch, local }: FetchIntoRequest): string {
  return formatGitCommand(["fetch", "--progress", remote, `${branch}:${local}`])
}

/** `merge`: merge a branch into the current branch with the chosen options. */
export function mergeCommand({ branch, noFastForward, log, noCommit }: MergeRequest): string {
  return formatGitCommand([
    "merge",
    ...(noFastForward ? ["--no-ff"] : []),
    ...(log ? ["--log"] : []),
    ...(noCommit ? ["--no-commit"] : []),
    branch,
  ])
}

/** `abortMerge`: abandon the merge in progress. */
export function abortMergeCommand(): string {
  return formatGitCommand(["merge", "--abort"])
}

/** `rebase`: replay the current branch onto another. */
export function rebaseCommand({ onto }: RebaseRequest): string {
  return formatGitCommand(["rebase", onto])
}

/** `abortRebase`: abandon the rebase in progress. */
export function abortRebaseCommand(): string {
  return formatGitCommand(["rebase", "--abort"])
}

/** `createTag`: annotated when there is a message (trimmed), lightweight otherwise. */
export function createTagCommand({ name, commit, message }: CreateTagRequest): string {
  const trimmed = message?.trim() ?? ""
  return formatGitCommand(["tag", ...(trimmed ? ["-a", "-m", trimmed] : []), name, commit])
}

/** `reset`: move the current branch to a commit; mixed unless another mode is chosen. */
export function resetCommand({ commit, mode = "mixed" }: ResetRequest): string {
  return formatGitCommand(["reset", `--${mode}`, commit])
}

/**
 * Whether the commit an operation acts on is a merge commit: the server
 * then takes it relative to its first parent (`-m 1`).
 */
export type CommitShape = { merge: boolean }

/** `cherryPick`: copy a commit onto the current branch. */
export function cherryPickCommand({ commit }: CherryPickRequest, { merge }: CommitShape): string {
  return formatGitCommand(["cherry-pick", ...(merge ? ["-m", "1"] : []), commit])
}

/** `revert`: add a commit undoing another. */
export function revertCommand({ commit }: RevertRequest, { merge }: CommitShape): string {
  return formatGitCommand(["revert", "--no-edit", ...(merge ? ["-m", "1"] : []), commit])
}

/** `abortCherryPick`: abandon the cherry-pick in progress. */
export function abortCherryPickCommand(): string {
  return formatGitCommand(["cherry-pick", "--abort"])
}

/** `abortRevert`: abandon the revert in progress. */
export function abortRevertCommand(): string {
  return formatGitCommand(["revert", "--abort"])
}
