import { createRootRoute, Outlet } from "@tanstack/react-router"
import { AppHeader } from "@/components/app-header"
import { useI18n } from "@/lib/i18n"

function NotFound() {
  const { t } = useI18n()
  return (
    <main className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center bg-background text-sm">
      {t("Page not found")}
    </main>
  )
}

function RootLayout() {
  return (
    <div className="min-h-screen bg-background pt-11">
      <AppHeader />
      <Outlet />
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
})
