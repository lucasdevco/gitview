import { createFileRoute } from "@tanstack/react-router"
import { FileListPage } from "@/features/files/file-list-page"
import { validateOverviewSearch } from "@/lib/url-filters"

export const Route = createFileRoute("/hotspots")({
  validateSearch: validateOverviewSearch,
  component: () => <FileListPage mode="hotspots" search={Route.useSearch()} />,
})
