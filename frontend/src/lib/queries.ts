import { queryOptions } from "@tanstack/react-query"
import {
  fetchBranches,
  fetchCommit,
  fetchCompare,
  fetchContributor,
  fetchDirectories,
  fetchExplain,
  fetchFile,
  fetchFiles,
  fetchFunction,
  fetchFunctions,
  fetchOverview,
  type OverviewFilters,
} from "@/lib/api"

export function branchesQueryOptions(branch: string) {
  return queryOptions({
    queryKey: ["branches", branch],
    queryFn: ({ signal }) => fetchBranches(branch, signal),
    staleTime: 30_000,
  })
}

export function commitQueryOptions(oid: string) {
  return queryOptions({
    queryKey: ["commit", oid],
    queryFn: ({ signal }) => fetchCommit(oid, signal),
    staleTime: 5 * 60_000,
  })
}

export function directoriesQueryOptions(parent: string) {
  return queryOptions({
    queryKey: ["directories", parent],
    queryFn: ({ signal }) => fetchDirectories(parent, signal),
    staleTime: 5 * 60_000,
  })
}

export function overviewQueryOptions(filters: OverviewFilters) {
  return queryOptions({
    queryKey: ["overview", filters],
    queryFn: ({ signal }) => fetchOverview(filters, signal),
    staleTime: 30_000,
  })
}

export function filesQueryOptions(mode: "hotspots" | "ownership", filters: OverviewFilters) {
  return queryOptions({
    queryKey: [mode, filters],
    queryFn: ({ signal }) => fetchFiles(mode, filters, signal),
    staleTime: 30_000,
  })
}

export function fileQueryOptions(file: string, filters: OverviewFilters) {
  return queryOptions({
    queryKey: ["file", file, filters],
    queryFn: ({ signal }) => fetchFile(file, filters, signal),
    staleTime: 30_000,
  })
}

export function contributorQueryOptions(id: string, filters: OverviewFilters) {
  return queryOptions({
    queryKey: ["contributor", id, filters],
    queryFn: ({ signal }) => fetchContributor(id, filters, signal),
    staleTime: 30_000,
  })
}

export function functionsQueryOptions(sort: string, filters: OverviewFilters) {
  return queryOptions({
    queryKey: ["functions", sort, filters],
    queryFn: ({ signal }) => fetchFunctions(sort, filters, signal),
    staleTime: 30_000,
  })
}

export function functionQueryOptions(id: string, filters: OverviewFilters) {
  return queryOptions({
    queryKey: ["function", id, filters],
    queryFn: ({ signal }) => fetchFunction(id, filters, signal),
    staleTime: 30_000,
  })
}

export function compareQueryOptions(from: string, to: string, filters: OverviewFilters) {
  return queryOptions({
    queryKey: ["compare", from, to, filters],
    queryFn: ({ signal }) => fetchCompare(from, to, filters, signal),
    staleTime: 30_000,
    enabled: from !== "" && to !== "",
  })
}

export function explainQueryOptions(month: string, path: string) {
  return queryOptions({
    queryKey: ["explain", month, path],
    queryFn: ({ signal }) => fetchExplain(month, path, signal),
    staleTime: 30_000,
    enabled: month !== "",
  })
}
