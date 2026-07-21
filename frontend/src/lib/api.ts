export type Warning = { code: string; message: string }
export type Repository = { name: string; root: string; branch: string; head: string; empty: boolean }
export type Totals = { commits: number; contributors: number; additions: number; deletions: number; churn: number }
export type ContributorActivity = { id: string; name: string; is_bot: boolean; commits: number; additions: number; deletions: number; churn: number }
export type Month = { month: string; commits: number; additions: number; deletions: number; churn: number; contributors: ContributorActivity[] }
export type Contributor = { id: string; name: string; is_bot: boolean; commits: number; additions: number; deletions: number; churn: number; last_active: string }
export type Commit = { oid: string; subject: string; author: string; author_id: string; authored_at: string; additions: number; deletions: number; churn: number }
export type CommitReview = {
  oid: string
  parent_oid: string
  subject: string
  author: string
  author_email: string
  authored_at: string
  files: number
  additions: number
  deletions: number
  patch: string
  patch_files: PatchFile[]
}
export type PatchFile = { path: string; old_path?: string; new_path?: string; status: "added" | "deleted" | "renamed" | "modified"; patch: string }
export type OverviewFilters = { since: string; until: string; path: string }
export type DirectoryListResponse = { data: { parent: string; directories: string[] } }
export type CommitReviewResponse = { schema_version: string; data: { repository: Repository; commit: CommitReview } }
export type BranchRef = { name: string; full_name: string; oid: string; remote: boolean; current: boolean; upstream?: string; ahead: number; behind: number }
export type BranchCommit = { oid: string; parents: string[]; subject: string; author: string; authored_at: string; refs: string[] }
export type WorkingTree = { dirty: boolean; files: string[]; patch: string; patch_files: PatchFile[] }
export type BranchResponse = { schema_version: string; data: { repository: Repository; branches: BranchRef[]; commits: BranchCommit[]; working_tree: WorkingTree } }
export type PathContribution = { path: string; commits: number; additions: number; deletions: number; churn: number }
export type ContributorIdentity = { id: string; name: string; is_bot: boolean }
export type FileMetric = {
  path: string
  commits: number
  contributors: number
  additions: number
  deletions: number
  churn: number
  last_changed: string
  last_contributor: ContributorIdentity
  historical_owner: ContributorIdentity
  historical_share: number
  recent_owner: ContributorIdentity
  recent_share: number
  bus_factor_80: number
  hotspot_score: number
  ownership_risk: number
}
export type FileContributor = { contributor: ContributorIdentity; commits: number; churn: number; share: number; last_active: string }
export type FunctionMetric = {
  id: string; name: string; qualified_name: string; signature: string; language: string; path: string; start_line: number; end_line: number; lines: number
  complexity: number; changes: number; additions: number; deletions: number; churn: number; hotspot_score: number
  owner: ContributorIdentity; owner_share: number; lineage_confidence: "exact" | "probable" | "unknown"
}
export type FunctionChange = { oid: string; subject: string; author: string; author_id: string; authored_at: string; additions: number; deletions: number; churn: number; confidence: "exact" | "probable" | "unknown" }
export type Insight = { kind: "summary" | "contributor" | "path" | "commit"; values: Record<string, string | number> }

export type OverviewResponse = {
  schema_version: string
  analysis_context: {
    revision: string
    timezone: string
    time_field: string
    merge_policy: string
    generated_at: string
    filters: OverviewFilters
  }
  warnings: Warning[]
  data: {
    repository: Repository
    totals: Totals
    monthly_activity: Month[]
    contributors: Contributor[]
    recent_commits: Commit[]
  }
}

export type ContributorResponse = {
  schema_version: string
  analysis_context: OverviewResponse["analysis_context"]
  warnings: Warning[]
  data: {
    repository: Repository
    contributor: Contributor
    monthly_activity: Month[]
    top_paths: PathContribution[]
    recent_commits: Commit[]
  }
}

export type FileListResponse = {
  schema_version: string
  analysis_context: OverviewResponse["analysis_context"]
  warnings: Warning[]
  data: { repository: Repository; files: FileMetric[]; recent_days: number; total: number; limit: number; has_more: boolean }
}

export type FileDetailResponse = {
  schema_version: string
  analysis_context: OverviewResponse["analysis_context"]
  warnings: Warning[]
  data: { repository: Repository; file: FileMetric; contributors: FileContributor[]; recent_commits: Commit[]; recent_days: number }
}
export type FunctionListResponse = {
  schema_version: string; analysis_context: OverviewResponse["analysis_context"]; warnings: Warning[]
  data: { repository: Repository; functions: FunctionMetric[]; analyzer_version: string; total: number; limit: number; has_more: boolean }
}
export type FunctionDetailResponse = {
  schema_version: string; analysis_context: OverviewResponse["analysis_context"]; warnings: Warning[]
  data: { repository: Repository; function: FunctionMetric; history: FunctionChange[]; analyzer_version: string }
}
export type CompareResponse = {
  schema_version: string; analysis_context: OverviewResponse["analysis_context"]; warnings: Warning[]
  data: { repository: Repository; from_ref: string; to_ref: string; from_revision: string; to_revision: string; totals: Totals; contributors: Contributor[]; files: FileMetric[]; files_total: number; files_limit: number; files_has_more: boolean; commits: Commit[] }
}
export type ExplainResponse = {
  schema_version: string; analysis_context: OverviewResponse["analysis_context"]; warnings: Warning[]
  data: { repository: Repository; month: string; totals: Totals; contributors: Contributor[]; paths: PathContribution[]; commits: Commit[]; insights: Insight[] }
}
type ErrorResponse = { error?: { code?: string; message?: string } }

export async function fetchOverview(filters: OverviewFilters, signal?: AbortSignal): Promise<OverviewResponse> {
  const suffix = filterSuffix(filters)
  const response = await fetch(`/api/v1/overview${suffix}`, { signal, headers: { Accept: "application/json" } })
  if (!response.ok) {
    let message = `Overview request failed (${response.status})`
    try {
      const payload = (await response.json()) as ErrorResponse
      if (payload.error?.message) message = payload.error.message
    } catch {
      // Keep the status-based message when the backend did not return JSON.
    }
    throw new Error(message)
  }
  return response.json() as Promise<OverviewResponse>
}

export async function fetchDirectories(parent: string, signal?: AbortSignal): Promise<DirectoryListResponse> {
  const query = new URLSearchParams()
  if (parent) query.set("parent", parent)
  const response = await fetch(`/api/v1/paths${query.size > 0 ? `?${query.toString()}` : ""}`, { signal, headers: { Accept: "application/json" } })
  if (!response.ok) throw await responseError(response, "Directory request failed")
  return response.json() as Promise<DirectoryListResponse>
}

export async function fetchCommit(oid: string, signal?: AbortSignal): Promise<CommitReviewResponse> {
  const response = await fetch(`/api/v1/commits/${encodeURIComponent(oid)}`, { signal, headers: { Accept: "application/json" } })
  if (!response.ok) throw await responseError(response, "Commit request failed")
  return response.json() as Promise<CommitReviewResponse>
}

export async function fetchBranches(branch: string, signal?: AbortSignal): Promise<BranchResponse> {
  const query = new URLSearchParams()
  if (branch) query.set("branch", branch)
  const response = await fetch(`/api/v1/branches${query.size ? `?${query}` : ""}`, { signal, headers: { Accept: "application/json" } })
  if (!response.ok) throw await responseError(response, "Branch history request failed")
  return response.json() as Promise<BranchResponse>
}

export async function fetchContributor(id: string, filters: OverviewFilters, signal?: AbortSignal): Promise<ContributorResponse> {
  const response = await fetch(`/api/v1/contributors/${encodeURIComponent(id)}${filterSuffix(filters)}`, { signal, headers: { Accept: "application/json" } })
  if (!response.ok) throw await responseError(response, "Contributor request failed")
  return response.json() as Promise<ContributorResponse>
}

export async function fetchFiles(mode: "hotspots" | "ownership", filters: OverviewFilters, signal?: AbortSignal): Promise<FileListResponse> {
  const response = await fetch(`/api/v1/${mode}${filterSuffix(filters)}`, { signal, headers: { Accept: "application/json" } })
  if (!response.ok) throw await responseError(response, `${mode} request failed`)
  return response.json() as Promise<FileListResponse>
}

export async function fetchFile(file: string, filters: OverviewFilters, signal?: AbortSignal): Promise<FileDetailResponse> {
  const query = new URLSearchParams(filterSuffix(filters).replace(/^\?/, ""))
  query.set("file", file)
  const response = await fetch(`/api/v1/file?${query.toString()}`, { signal, headers: { Accept: "application/json" } })
  if (!response.ok) throw await responseError(response, "File request failed")
  return response.json() as Promise<FileDetailResponse>
}

export async function fetchFunctions(sort: string, filters: OverviewFilters, signal?: AbortSignal): Promise<FunctionListResponse> {
  const query = new URLSearchParams(filterSuffix(filters).replace(/^\?/, ""))
  if (sort && sort !== "hotspot") query.set("sort", sort)
  const response = await fetch(`/api/v1/functions${query.size > 0 ? `?${query.toString()}` : ""}`, { signal, headers: { Accept: "application/json" } })
  if (!response.ok) throw await responseError(response, "Function request failed")
  return response.json() as Promise<FunctionListResponse>
}

export async function fetchFunction(id: string, filters: OverviewFilters, signal?: AbortSignal): Promise<FunctionDetailResponse> {
  const response = await fetch(`/api/v1/functions/${encodeURIComponent(id)}${filterSuffix(filters)}`, { signal, headers: { Accept: "application/json" } })
  if (!response.ok) throw await responseError(response, "Function history request failed")
  return response.json() as Promise<FunctionDetailResponse>
}

export async function fetchCompare(from: string, to: string, filters: OverviewFilters, signal?: AbortSignal): Promise<CompareResponse> {
  const query = new URLSearchParams(filterSuffix(filters).replace(/^\?/, "")); query.set("from", from); query.set("to", to)
  const response = await fetch(`/api/v1/compare?${query.toString()}`, { signal, headers: { Accept: "application/json" } })
  if (!response.ok) throw await responseError(response, "Comparison request failed")
  return response.json() as Promise<CompareResponse>
}

export async function fetchExplain(month: string, path: string, signal?: AbortSignal): Promise<ExplainResponse> {
  const query = new URLSearchParams({ month }); if (path) query.set("path", path)
  const response = await fetch(`/api/v1/explain?${query.toString()}`, { signal, headers: { Accept: "application/json" } })
  if (!response.ok) throw await responseError(response, "Monthly explanation request failed")
  return response.json() as Promise<ExplainResponse>
}

function filterSuffix(filters: OverviewFilters): string {
  const query = new URLSearchParams()
  if (filters.since) query.set("since", filters.since)
  if (filters.until) query.set("until", filters.until)
  if (filters.path) query.set("path", filters.path)
  return query.size > 0 ? `?${query.toString()}` : ""
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  let message = `${fallback} (${response.status})`
  try {
    const payload = (await response.json()) as ErrorResponse
    if (payload.error?.message) message = payload.error.message
  } catch {
    // Keep the status-based message when the backend did not return JSON.
  }
  return new Error(message)
}
