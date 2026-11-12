import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { connectEvents, watchWorktree } from "./events"

/**
 * Keeps every open repository's queries fresh: follows the server's change
 * events and polls the working tree while the page is visible. Render once,
 * inside the QueryClientProvider.
 */
export function LiveRefresh({ token }: { token: string | null }) {
  const queryClient = useQueryClient()
  useEffect(() => (token ? connectEvents({ token, queryClient }) : undefined), [token, queryClient])
  useEffect(() => watchWorktree({ queryClient }), [queryClient])
  return null
}
