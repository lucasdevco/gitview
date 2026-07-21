import { Link, useRouterState } from "@tanstack/react-router"
import { GitBranch } from "lucide-react"

import { AppNav } from "@/components/app-nav"
import { LanguageSwitcher } from "@/components/language-switcher"
import type { OverviewRouteSearch } from "@/lib/url-filters"

export function AppHeader() {
  const currentSearch = useRouterState({ select: (state) => state.location.search })
  const search: OverviewRouteSearch = {
    since: stringValue(currentSearch.since),
    until: stringValue(currentSearch.until),
    path: stringValue(currentSearch.path),
  }

  return (
    <header className="fixed inset-x-0 top-0 z-[110] flex h-11 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur">
      <Link
        to="/"
        search={search}
        className="flex shrink-0 items-center gap-2"
        aria-label="GitView"
      >
        <span className="flex size-6 items-center justify-center rounded bg-primary text-primary-foreground">
          <GitBranch className="size-3.5" />
        </span>
        <span className="text-xs font-semibold tracking-tight">GitView</span>
      </Link>
      <div
        id="app-header-context"
        className="flex min-w-0 flex-1 items-center gap-2 lg:max-w-[calc(50vw-19rem)]"
      />
      <AppNav search={search} />
      <div className="ml-auto" />
      <div id="app-header-actions" className="flex shrink-0 items-center gap-1" />
      <LanguageSwitcher />
    </header>
  )
}

function stringValue(value: unknown) {
  return typeof value === "string" && value !== "" ? value : undefined
}
