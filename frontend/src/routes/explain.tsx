import { createFileRoute } from "@tanstack/react-router"
import { ExplainPage } from "@/features/explain/explain-page"
import { validateExplainSearch } from "@/lib/url-filters"

export const Route = createFileRoute("/explain")({
  validateSearch: validateExplainSearch,
  component: () => <ExplainPage search={Route.useSearch()} />,
})
