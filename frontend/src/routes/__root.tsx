import { createRootRoute, Outlet } from "@tanstack/react-router"
import { useI18n } from "@/lib/i18n"

function NotFound() {
  const { t } = useI18n()
  return <main className="flex min-h-screen items-center justify-center bg-background text-sm">{t("Page not found")}</main>
}

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
})
