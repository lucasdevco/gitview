// Write operations: POST .../operations/{op} with a JSON request body, and
// the command log of the git commands they ran (GET .../commands).
//
// Adding an operation: add its request type to OperationRequests (matching
// the Go request struct in internal/repo/ops), a preview builder in
// lib/command-preview.ts, and call it with useOperation(repoId, "<op>").
import { queryOptions } from "@tanstack/react-query"
import type { ApiClient } from "./client"
import { repoKeys } from "./queries"
import { repoPath } from "./repos"

/** One executed git write command, as the command log shows it. */
export type CommandEntry = {
  /** Display form, e.g. `git add -- ':(literal)a.txt'`. */
  command: string
  /** RFC 3339 time the command started. */
  startedAt: string
  durationMs: number
  /** git's exit status; -1 when git did not run to completion. */
  exitCode: number
  /** The failure's error code (e.g. `hook_failed`); absent on success. */
  error?: string
}

export type OperationResult = {
  /** The git commands the operation ran, in order. */
  commands: CommandEntry[]
}

/** Whole files by path relative to the repository root. For a staged rename, list both paths. */
export type FilesRequest = { paths: string[] }

export type CommitRequest = {
  /** Full message: subject, blank line, body. */
  message: string
  /** Replace the last commit instead of adding one. */
  amend?: boolean
  /** Skip the pre-commit and commit-msg hooks (`--no-verify`). */
  noVerify?: boolean
}

/** A hunk's `@@ -oldStart,oldCount +newStart,newCount @@` header range. */
export type HunkRange = { oldStart: number; oldCount: number; newStart: number; newCount: number }

/**
 * One hunk of one file's diff. The server re-reads the diff and rejects a
 * hunk that is no longer there, so the request never acts on unseen changes.
 */
export type HunkRequest = {
  path: string
  /** Original path of a staged rename, as in the staged diff. */
  oldPath?: string
  hunk: HunkRange
}

/** `stashPush`: save every change, untracked files included, and clean the working tree. */
export type StashPushRequest = {
  /** Describes the stash; git writes "WIP on <branch>: …" when empty. */
  message?: string
  /** Keep the staged changes in the index and working tree (`--keep-index`). */
  keepIndex?: boolean
}

/**
 * `stashApply` / `stashDrop`: one stash, by its index and its oid from the
 * stash list. The server refuses the request if the stash at `index` is no
 * longer `oid`.
 */
export type StashRequest = { index: number; oid: string }

/** Request body of each operation, by operation name. */
export type OperationRequests = {
  stage: FilesRequest
  unstage: FilesRequest
  commit: CommitRequest
  /** Add one hunk of an unstaged or untracked file to the index. */
  stageHunk: HunkRequest
  /** Remove one hunk of a staged file from the index. */
  unstageHunk: HunkRequest
  /** Revert one unstaged hunk in the working tree; cannot be undone. */
  discardHunk: HunkRequest
  /** Stash every change, untracked files included. */
  stashPush: StashPushRequest
  /** Apply a stash to the working tree and keep it. */
  stashApply: StashRequest
  /** Delete a stash; cannot be undone. */
  stashDrop: StashRequest
}

export type OperationName = keyof OperationRequests

/**
 * Runs a write operation. A failure throws ApiError carrying git's output
 * (`output`) and the commands that ran (`commands`).
 */
export function runOperation<Op extends OperationName>(
  client: ApiClient,
  repoId: string,
  op: Op,
  request: OperationRequests[Op],
  signal?: AbortSignal,
): Promise<OperationResult> {
  return client.post(repoPath(repoId, "operations", op), request, signal)
}

export const operationKeys = {
  commandLog: (repoId: string) => [...repoKeys.repo(repoId), "commands"] as const,
}

/** The repository's recent write commands, oldest first. */
export function getCommandLog(client: ApiClient, repoId: string, signal?: AbortSignal): Promise<CommandEntry[]> {
  return client.get(repoPath(repoId, "commands"), signal)
}

export function commandLogQuery(client: ApiClient, repoId: string) {
  return queryOptions({
    queryKey: operationKeys.commandLog(repoId),
    queryFn: ({ signal }) => getCommandLog(client, repoId, signal),
  })
}
