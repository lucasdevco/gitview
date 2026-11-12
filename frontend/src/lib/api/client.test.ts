import { describe, expect, it } from "vitest"
import { ApiError, createApiClient } from "./client"
import { getRepoSummary, listRepos, repoPath } from "./repos"

type Call = { url: string; init?: RequestInit }

function fakeFetch(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return async (input, init) => {
    calls.push({ url: String(input), init })
    const text = typeof body === "string" ? body : JSON.stringify(body)
    return new Response(text, { status, headers: { "Content-Type": "application/json" } })
  }
}

describe("api client", () => {
  it("calls the API without credentials and returns the response data", async () => {
    const calls: Call[] = []
    const client = createApiClient({ fetch: fakeFetch(200, { data: [{ id: "r1" }] }, calls) })

    await expect(client.get("/api/v1/repos")).resolves.toEqual([{ id: "r1" }])
    expect(calls[0].url).toBe("/api/v1/repos")
    expect(new Headers(calls[0].init?.headers).has("Authorization")).toBe(false)
  })

  it("turns the server's error envelope into an ApiError", async () => {
    const client = createApiClient({
      fetch: fakeFetch(404, { error: { code: "repo_not_found", message: "no open repository has id x" } }),
    })

    const error = await client.get("/api/v1/repos/x").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, code: "repo_not_found", message: "no open repository has id x" })
  })

  it("reports responses that are not gitview JSON", async () => {
    const client = createApiClient({ fetch: fakeFetch(502, "<html>bad gateway</html>") })
    await expect(client.get("/api/v1/repos")).rejects.toMatchObject({ status: 502, code: "http_error" })
  })

  it("reports an unreachable server", async () => {
    const client = createApiClient({
      fetch: async () => {
        throw new TypeError("Failed to fetch")
      },
    })
    await expect(client.get("/api/v1/repos")).rejects.toMatchObject({ status: 0, code: "network_error" })
  })
})

describe("repository endpoints", () => {
  it("builds per-repository paths with encoded segments", () => {
    expect(repoPath("abc123")).toBe("/api/v1/repos/abc123")
    expect(repoPath("abc123", "commits", "a/b c")).toBe("/api/v1/repos/abc123/commits/a%2Fb%20c")
  })

  it("lists repositories and reads one repository's summary", async () => {
    const calls: Call[] = []
    const summary = {
      id: "abc123",
      name: "gitview",
      root: "/src/gitview",
      branch: "main",
      detached: false,
      head: "0123456789abcdef0123456789abcdef01234567",
      empty: false,
      state: "clean",
      identity: { name: "Ada", email: "ada@example.com" },
    }
    const responses = [{ data: [{ id: "abc123", name: "gitview", root: "/src/gitview" }] }, { data: summary }]
    const client = createApiClient({
      fetch: async (input, init) => {
        calls.push({ url: String(input), init })
        return new Response(JSON.stringify(responses.shift()), { status: 200 })
      },
    })

    await expect(listRepos(client)).resolves.toEqual([{ id: "abc123", name: "gitview", root: "/src/gitview" }])
    await expect(getRepoSummary(client, "abc123")).resolves.toEqual(summary)
    expect(calls.map((call) => call.url)).toEqual(["/api/v1/repos", "/api/v1/repos/abc123"])
  })
})
