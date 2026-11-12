// Command previews: the git command an operation will run, rendered exactly
// as the backend reports it in the command log (internal/git/command.go
// Command.String and the builders in internal/repo/ops). Each builder takes
// the operation's request body, so a dialog can show the preview of what it
// is about to send.
//
// Adding an operation: add a builder here next to its request type and a
// vitest case using the string the backend's API test expects.
import type {
  CheckoutRequest,
  CommitRequest,
  CreateBranchRequest,
  DeleteBranchesRequest,
  MergeRequest,
  RebaseRequest,
  RenameBranchRequest,
  SetUpstreamRequest,
  StashPushRequest,
  StashRequest,
} from "@/lib/api/operations"

/** Renders `git <args...>` the way a user would type it in a POSIX shell. */
export function formatGitCommand(args: readonly string[]): string {
  return ["git", ...args.map(shellQuote)].join(" ")
}

const SAFE_ARGUMENT = /^[A-Za-z0-9_@%+=:,./^~-]+$/

function shellQuote(arg: string): string {
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

/** `checkout`: switch to a local branch. */
export function checkoutCommand({ branch }: CheckoutRequest): string {
  return formatGitCommand(["switch", branch])
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
