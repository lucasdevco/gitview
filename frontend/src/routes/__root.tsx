import { createRootRoute, Outlet } from "@tanstack/react-router"

function NotFound() {
  return <main className="flex h-dvh items-center justify-center bg-background text-sm">页面不存在</main>
}

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
})
