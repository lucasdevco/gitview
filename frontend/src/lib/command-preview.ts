// Command previews: the git command an operation will run, rendered exactly
// as the backend reports it in the command log (internal/git/command.go
// Command.String and the builders in internal/repo/ops). Each builder takes
// the operation's request body, so a dialog can show the preview of what it
// is about to send.
//
// Adding an operation: add a builder here next to its request type and a
// vitest case using the string the backend's API test expects.
import type { CommitRequest } from "@/lib/api/operations"

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
