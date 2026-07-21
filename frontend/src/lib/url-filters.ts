import type { OverviewFilters } from "@/lib/api"

export type OverviewRouteSearch = {
  since?: string
  until?: string
  path?: string
}

export type FileRouteSearch = OverviewRouteSearch & { file?: string }
export type FunctionRouteSearch = OverviewRouteSearch & {
  sort?: "hotspot" | "churn" | "changes" | "complexity"
}
export type CompareRouteSearch = OverviewRouteSearch & { from?: string; to?: string }
export type ExplainRouteSearch = { month?: string; path?: string }

export const emptyFilters: OverviewFilters = { since: "", until: "", path: "" }

export function validateOverviewSearch(search: Record<string, unknown>): OverviewRouteSearch {
  return {
    since: stringValue(search.since),
    until: stringValue(search.until),
    path: stringValue(search.path),
  }
}

export function validateFileSearch(search: Record<string, unknown>): FileRouteSearch {
  return { ...validateOverviewSearch(search), file: stringValue(search.file) }
}

export function validateFunctionSearch(search: Record<string, unknown>): FunctionRouteSearch {
  const result: FunctionRouteSearch = validateOverviewSearch(search)
  if (
    search.sort === "churn" ||
    search.sort === "changes" ||
    search.sort === "complexity" ||
    search.sort === "hotspot"
  )
    result.sort = search.sort
  return result
}

export function validateCompareSearch(search: Record<string, unknown>): CompareRouteSearch {
  return {
    ...validateOverviewSearch(search),
    from: stringValue(search.from),
    to: stringValue(search.to),
  }
}
export function validateExplainSearch(search: Record<string, unknown>): ExplainRouteSearch {
  return { month: stringValue(search.month), path: stringValue(search.path) }
}

export function filtersFromSearch(search: OverviewRouteSearch): OverviewFilters {
  return {
    since: search.since ?? "",
    until: search.until ?? "",
    path: search.path ?? "",
  }
}

export function searchFromFilters(filters: OverviewFilters): OverviewRouteSearch {
  return {
    since: filters.since || undefined,
    until: filters.until || undefined,
    path: filters.path || undefined,
  }
}

export function sameFilters(left: OverviewFilters, right: OverviewFilters): boolean {
  return left.since === right.since && left.until === right.until && left.path === right.path
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined
}
