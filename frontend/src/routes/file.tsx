import { createFileRoute } from "@tanstack/react-router"
import { FileDetailPage } from "@/features/files/file-detail-page"
import { validateFileSearch } from "@/lib/url-filters"

export const Route = createFileRoute("/file")({
  validateSearch: validateFileSearch,
  component: () => <FileDetailPage search={Route.useSearch()} />,
})
