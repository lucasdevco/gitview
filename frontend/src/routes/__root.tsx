import { createRootRoute, Outlet } from "@tanstack/react-router"

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: () => <main className="flex min-h-screen items-center justify-center bg-background text-sm">Page not found</main>,
})
