import { createFileRoute } from "@tanstack/react-router"
import { BranchPage, type BranchRouteSearch } from "@/features/branches/branch-page"

export const Route = createFileRoute("/branches")({
  validateSearch: (search: Record<string, unknown>): BranchRouteSearch => ({ branch: typeof search.branch === "string" && search.branch ? search.branch : undefined }),
  component: () => <BranchPage search={Route.useSearch()} />,
})
