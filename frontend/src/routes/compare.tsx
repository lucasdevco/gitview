import { createFileRoute } from "@tanstack/react-router"
import { ComparePage } from "@/features/compare/compare-page"
import { validateCompareSearch } from "@/lib/url-filters"

export const Route = createFileRoute("/compare")({
  validateSearch: validateCompareSearch,
  component: () => <ComparePage search={Route.useSearch()} />,
})
