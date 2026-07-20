import { createFileRoute } from "@tanstack/react-router"
import { FunctionListPage } from "@/features/functions/function-list-page"
import { validateFunctionSearch } from "@/lib/url-filters"

export const Route = createFileRoute("/functions")({ validateSearch: validateFunctionSearch, component: () => <FunctionListPage search={Route.useSearch()} /> })
