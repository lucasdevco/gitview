import { describe, expect, it } from "vitest"
import { ApiError, createApiClient } from "./client"
import { getCommandLog, runOperation } from "./operations"

type Call = { url: string; init?: RequestInit }

function respond(status: number, body: unknown, calls: Call[]): typeof fetch {
  return async (input, init) => {
    calls.push({ url: String(input), init })
    return new Response(JSON.stringify(body), { status })
  }
}

const entry = {
  command: "git add -- ':(literal)a.txt'",
  startedAt: "2026-11-12T10:00:00Z",
  durationMs: 12,
  exitCode: 0,
}

describe("runOperation", () => {
  it("POSTs the request as JSON and returns the commands it ran", async () => {
    const calls: Call[] = []
    const client = createApiClient({ fetch: respond(200, { data: { commands: [entry] } }, calls) })

    await expect(runOperation(client, "abc", "stage", { paths: ["a.txt"] })).resolves.toEqual({ commands: [entry] })

    expect(calls[0].url).toBe("/api/v1/repos/abc/operations/stage")
    expect(calls[0].init?.method).toBe("POST")
    const headers = new Headers(calls[0].init?.headers)
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ paths: ["a.txt"] })
  })

  it("keeps a failed operation's git output and commands on the ApiError", async () => {
    const failed = { ...entry, command: "git commit -m x", exitCode: 1, error: "hook_failed" }
    const client = createApiClient({
      fetch: respond(
        422,
        {
          error: {
            code: "hook_failed",
            message: "the pre-commit hook failed",
            output: "lint: trailing whitespace",
            commands: [failed],
          },
        },
        [],
      ),
    })

    const error = await runOperation(client, "abc", "commit", { message: "x" }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      code: "hook_failed",
      output: "lint: trailing whitespace",
      commands: [failed],
    })
  })
})

describe("getCommandLog", () => {
  it("reads the repository's recent write commands", async () => {
    const calls: Call[] = []
    const client = createApiClient({ fetch: respond(200, { data: [entry] }, calls) })

    await expect(getCommandLog(client, "abc")).resolves.toEqual([entry])
    expect(calls[0].url).toBe("/api/v1/repos/abc/commands")
  })
})
