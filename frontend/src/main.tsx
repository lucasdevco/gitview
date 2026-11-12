import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@/components/ui/tooltip"
import "@/index.css"
import { createApiClient } from "@/lib/api/client"
import { ApiProvider } from "@/lib/api/context"
import { LiveRefresh } from "@/lib/api/live-refresh"
import { takeSessionToken } from "@/lib/api/session"
import { routeTree } from "@/routeTree.gen"

if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark")
}

// Take the access token from the URL gitview printed, then hide it from the
// address bar so it is not bookmarked or shared by accident.
const session = takeSessionToken(window.location.href, window.sessionStorage)
if (session.url !== window.location.href) window.history.replaceState(window.history.state, "", session.url)
const api = createApiClient({ token: session.token })

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})
const router = createRouter({ routeTree, defaultPreload: "intent" })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Missing #root element")

createRoot(rootElement).render(
  <StrictMode>
    <ApiProvider client={api}>
      <QueryClientProvider client={queryClient}>
        <LiveRefresh token={session.token} />
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </ApiProvider>
  </StrictMode>,
)
