import { createFileRoute } from "@tanstack/react-router"
import { App } from "@/App"
import { validateOverviewSearch } from "@/lib/url-filters"

export const Route = createFileRoute("/")({
  validateSearch: validateOverviewSearch,
  component: App,
})
