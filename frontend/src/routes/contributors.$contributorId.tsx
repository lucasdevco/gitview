import { createFileRoute } from "@tanstack/react-router"
import { ContributorPage } from "@/features/contributors/contributor-page"
import { validateOverviewSearch } from "@/lib/url-filters"

export const Route = createFileRoute("/contributors/$contributorId")({
  validateSearch: validateOverviewSearch,
  component: ContributorRoute,
})

function ContributorRoute() {
  const { contributorId } = Route.useParams()
  const search = Route.useSearch()
  return <ContributorPage contributorId={contributorId} search={search} />
}
