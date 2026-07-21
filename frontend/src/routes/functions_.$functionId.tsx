import { createFileRoute } from "@tanstack/react-router"
import { FunctionDetailPage } from "@/features/functions/function-detail-page"
import { validateOverviewSearch } from "@/lib/url-filters"

export const Route = createFileRoute("/functions_/$functionId")({
  validateSearch: validateOverviewSearch,
  component: () => (
    <FunctionDetailPage functionId={Route.useParams().functionId} search={Route.useSearch()} />
  ),
})
