import { createFileRoute } from "@tanstack/react-router"
import { CommitPage } from "@/features/commits/commit-page"
import { validateOverviewSearch } from "@/lib/url-filters"

export const Route = createFileRoute("/commits/$commitId")({
  validateSearch: validateOverviewSearch,
  component: () => <CommitPage commitId={Route.useParams().commitId} search={Route.useSearch()} />,
})
