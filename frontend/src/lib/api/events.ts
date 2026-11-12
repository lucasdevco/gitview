// Live refresh. The server pushes typed events over GET /api/v1/events
// (server-sent events); a "repo.changed" event names the areas of a
// repository that changed, and only the queries depending on them are
// refreshed. Outside edits to working tree files are not pushed: the
// working tree is polled while the page is visible and refreshed on focus.
import type { QueryClient, QueryKey } from "@tanstack/react-query"
import { repoKeys } from "./queries"

/** A part of a repository whose changes the server reports separately. */
export type ChangedArea = "refs" | "index" | "worktree" | "state"

/**
 * A message on the event stream, discriminated by `type`. Add new kinds
 * (job progress, credential requests, ...) to this union, to KNOWN_TYPES and
 * to handleServerEvent.
 */
export type ServerEvent = {
  type: "repo.changed"
  repoId: string
  /** Increases with every change of the repository. */
  version: number
  changed: ChangedArea[]
}

const KNOWN_TYPES: ReadonlySet<string> = new Set<ServerEvent["type"]>(["repo.changed"])

/** How often working tree queries refresh while the page is visible. */
export const WORKTREE_POLL_MS = 5000

/** How long to wait before reopening a stream the browser gave up on. */
const RECONNECT_DELAY_MS = 5000

/** The event stream's address. EventSource cannot send headers, so the token goes in the query. */
export function eventsUrl(token: string): string {
  return `/api/v1/events?token=${encodeURIComponent(token)}`
}

/** Parses one event's data; null for malformed data or kinds this page does not know. */
export function parseServerEvent(data: string): ServerEvent | null {
  try {
    const event = JSON.parse(data)
    return typeof event?.type === "string" && KNOWN_TYPES.has(event.type) ? (event as ServerEvent) : null
  } catch {
    return null
  }
}

/**
 * Areas each per-repository query kind (the key's third element) depends on.
 * A kind not listed here is refreshed by any change; list new kinds to make
 * their refresh precise.
 */
const DEPENDS_ON: Record<string, readonly ChangedArea[]> = {
  summary: ["refs", "state"],
  // Staged changes compare against HEAD; conflicts come with an in-progress state.
  status: ["refs", "index", "worktree", "state"],
  refs: ["refs"],
  graph: ["refs"],
  // A commit and its diffs never change.
  commit: [],
  // The command log only grows with gitview's own writes, which refresh it.
  commands: [],
}

const DIFF_DEPENDS_ON: Record<string, readonly ChangedArea[]> = {
  staged: ["refs", "index"],
  unstaged: ["index", "worktree"],
  untracked: ["worktree"],
  commit: [],
}

function dependsOn(queryKey: QueryKey, changed: readonly ChangedArea[]): boolean {
  const [, , kind, source] = queryKey
  if (typeof kind !== "string") return false
  const areas = kind === "diff" ? DIFF_DEPENDS_ON[String(source)] : DEPENDS_ON[kind]
  return areas === undefined || areas.some((area) => changed.includes(area))
}

/** Refreshes the queries of a repository that depend on the changed areas. */
export function refreshChanged(queryClient: QueryClient, repoId: string, changed: readonly ChangedArea[]) {
  return queryClient.invalidateQueries({
    queryKey: repoKeys.repo(repoId),
    predicate: (query) => dependsOn(query.queryKey, changed),
  })
}

/** Refreshes every repository's queries that depend on working tree files. */
export function refreshWorktrees(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    queryKey: repoKeys.all,
    predicate: (query) => dependsOn(query.queryKey, ["worktree"]),
  })
}

export function handleServerEvent(queryClient: QueryClient, event: ServerEvent) {
  switch (event.type) {
    case "repo.changed":
      return refreshChanged(queryClient, event.repoId, event.changed)
  }
}

/** The part of EventSource that connectEvents uses. */
export type EventStream = Pick<EventSource, "readyState" | "onopen" | "onmessage" | "onerror" | "close">

const CLOSED = 2

export type ConnectEventsOptions = {
  token: string
  queryClient: QueryClient
  createEventSource?: (url: string) => EventStream
}

/**
 * Follows the event stream until the returned function is called. Events
 * missed while disconnected cannot be replayed, so every query is
 * refreshed after a reconnect.
 */
export function connectEvents({
  token,
  queryClient,
  createEventSource = (url) => new EventSource(url),
}: ConnectEventsOptions): () => void {
  let source: EventStream | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let interrupted = false

  const open = () => {
    const stream = createEventSource(eventsUrl(token))
    source = stream
    stream.onopen = () => {
      if (interrupted) void queryClient.invalidateQueries({ queryKey: repoKeys.all })
      interrupted = false
    }
    stream.onmessage = (message) => {
      const event = parseServerEvent(message.data)
      if (event) void handleServerEvent(queryClient, event)
    }
    stream.onerror = () => {
      interrupted = true
      // The browser retries on its own unless it gave up (e.g. an HTTP error).
      if (stream.readyState === CLOSED) retry = setTimeout(open, RECONNECT_DELAY_MS)
    }
  }
  open()

  return () => {
    clearTimeout(retry)
    source?.close()
  }
}

/** Where page visibility and focus are observed; `document` and `window` in the browser. */
export type PageSignals = {
  document: EventTarget & { readonly visibilityState: DocumentVisibilityState }
  window: EventTarget
}

export type WatchWorktreeOptions = Partial<PageSignals> & {
  queryClient: QueryClient
  intervalMs?: number
}

/**
 * Refreshes working tree queries every `intervalMs` while the page is
 * visible, and at once when the window gains focus or the page becomes
 * visible. Returns a function that stops watching.
 */
export function watchWorktree({
  queryClient,
  document: page = globalThis.document,
  window: win = globalThis.window,
  intervalMs = WORKTREE_POLL_MS,
}: WatchWorktreeOptions): () => void {
  const refresh = () => void refreshWorktrees(queryClient)
  const tick = () => {
    if (page.visibilityState === "visible") refresh()
  }
  const timer = setInterval(tick, intervalMs)
  win.addEventListener("focus", refresh)
  page.addEventListener("visibilitychange", tick)
  return () => {
    clearInterval(timer)
    win.removeEventListener("focus", refresh)
    page.removeEventListener("visibilitychange", tick)
  }
}
