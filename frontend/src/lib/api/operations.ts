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

/** Request body of each operation, by operation name. */
export type OperationRequests = {
  stage: FilesRequest
  unstage: FilesRequest
  commit: CommitRequest
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
