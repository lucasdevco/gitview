import { QueryClient, type QueryKey } from "@tanstack/react-query"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  type ChangedArea,
  connectEvents,
  type EventStream,
  eventsUrl,
  parseServerEvent,
  refreshChanged,
  watchWorktree,
} from "./events"

const keys = {
  repos: ["repos"],
  summary: ["repos", "r1", "summary"],
  status: ["repos", "r1", "status"],
  stagedDiff: ["repos", "r1", "diff", "staged", "a.txt", "", ""],
  unstagedDiff: ["repos", "r1", "diff", "unstaged", "a.txt", "", ""],
  untrackedDiff: ["repos", "r1", "diff", "untracked", "new.txt", "", ""],
  commitDiff: ["repos", "r1", "diff", "commit", "a.txt", "", "abc"],
  graph: ["repos", "r1", "graph", { scope: "all", remotes: true }],
  refs: ["repos", "r1", "refs"],
  commit: ["repos", "r1", "commit", "abc"],
  commands: ["repos", "r1", "commands"],
  otherRepoStatus: ["repos", "r2", "status"],
} satisfies Record<string, QueryKey>

function cachedQueries(): QueryClient {
  const client = new QueryClient()
  for (const key of Object.values(keys)) client.setQueryData(key, {})
  return client
}

function invalidated(client: QueryClient): string[] {
  return Object.entries(keys)
    .filter(([, key]) => client.getQueryState(key)?.isInvalidated)
    .map(([name]) => name)
    .sort()
}

async function refreshedBy(changed: ChangedArea[]): Promise<string[]> {
  const client = cachedQueries()
  await refreshChanged(client, "r1", changed)
  return invalidated(client)
}

test("a ref change refreshes HEAD, branches, the graph and what compares against HEAD", async () => {
  expect(await refreshedBy(["refs"])).toEqual(["graph", "refs", "stagedDiff", "status", "summary"])
})

test("an index change refreshes status and the diffs that involve the index", async () => {
  expect(await refreshedBy(["index"])).toEqual(["stagedDiff", "status", "unstagedDiff"])
})

test("a working tree change refreshes status and the diffs of working tree files", async () => {
  expect(await refreshedBy(["worktree"])).toEqual(["status", "unstagedDiff", "untrackedDiff"])
})

test("a state change refreshes the summary and status", async () => {
  expect(await refreshedBy(["state"])).toEqual(["status", "summary"])
})

test("query kinds without declared dependencies are refreshed by any change", async () => {
  const client = new QueryClient()
  client.setQueryData(["repos", "r1", "something-new"], {})
  await refreshChanged(client, "r1", ["refs"])
  expect(client.getQueryState(["repos", "r1", "something-new"])?.isInvalidated).toBe(true)
})

test("server events are parsed by type and unknown kinds are ignored", () => {
  expect(parseServerEvent('{"type":"repo.changed","repoId":"r1","version":3,"changed":["refs"]}')).toEqual({
    type: "repo.changed",
    repoId: "r1",
    version: 3,
    changed: ["refs"],
  })
  expect(parseServerEvent('{"type":"from.the.future"}')).toBeNull()
  expect(parseServerEvent("not json")).toBeNull()
})

test("the event stream URL carries the token, since EventSource cannot set headers", () => {
  expect(eventsUrl("a b&c")).toBe("/api/v1/events?token=a%20b%26c")
})

class FakeEventSource {
  static readonly CLOSED = 2
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(readonly url: string) {}
  close() {
    this.closed = true
    this.readyState = FakeEventSource.CLOSED
  }
}

function connect(client: QueryClient) {
  const sources: FakeEventSource[] = []
  const disconnect = connectEvents({
    token: "t",
    queryClient: client,
    createEventSource: (url) => {
      const source = new FakeEventSource(url)
      sources.push(source)
      return source as unknown as EventStream
    },
  })
  return { sources, disconnect }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test("a change event refreshes exactly the affected queries of that repository", () => {
  const client = cachedQueries()
  const { sources } = connect(client)
  sources[0]?.onopen?.()
  sources[0]?.onmessage?.({ data: '{"type":"repo.changed","repoId":"r1","version":1,"changed":["state"]}' })
  expect(invalidated(client)).toEqual(["status", "summary"])
})

test("after reconnecting, every query is refreshed because events may have been missed", () => {
  const client = cachedQueries()
  const { sources } = connect(client)
  sources[0]?.onopen?.()
  expect(invalidated(client)).toEqual([])
  sources[0]?.onerror?.()
  sources[0]?.onopen?.()
  expect(invalidated(client)).toEqual(Object.keys(keys).sort())
})

test("a stream the browser gave up on is reopened after a delay", () => {
  const client = cachedQueries()
  const { sources, disconnect } = connect(client)
  sources[0]?.close()
  sources[0]?.onerror?.()
  vi.advanceTimersByTime(10_000)
  expect(sources).toHaveLength(2)
  disconnect()
  expect(sources[1]?.closed).toBe(true)
})

class FakePage extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible"
}

test("working tree queries refresh periodically while the page is visible, and at once on focus", () => {
  const client = cachedQueries()
  const page = new FakePage()
  const stop = watchWorktree({ queryClient: client, document: page, window: page, intervalMs: 1000 })

  page.visibilityState = "hidden"
  vi.advanceTimersByTime(1000)
  expect(invalidated(client)).toEqual([])

  page.dispatchEvent(new Event("focus"))
  expect(invalidated(client)).toEqual(["otherRepoStatus", "status", "unstagedDiff", "untrackedDiff"])

  const fresh = cachedQueries()
  stop()
  const stopFresh = watchWorktree({ queryClient: fresh, document: page, window: page, intervalMs: 1000 })
  page.visibilityState = "visible"
  vi.advanceTimersByTime(1000)
  expect(invalidated(fresh)).toEqual(["otherRepoStatus", "status", "unstagedDiff", "untrackedDiff"])
  stopFresh()
})
