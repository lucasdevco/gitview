export type Warning = { code: string; message: string }
export type Repository = { name: string; root: string; branch: string; head: string; empty: boolean }
export type Totals = { commits: number; contributors: number; additions: number; deletions: number; churn: number }
export type Month = { month: string; commits: number; additions: number; deletions: number; churn: number }
export type Contributor = { name: string; commits: number; additions: number; deletions: number; churn: number; last_active: string }
export type Commit = { oid: string; subject: string; author: string; authored_at: string; additions: number; deletions: number; churn: number }

export type OverviewResponse = {
  schema_version: string
  analysis_context: {
    revision: string
    timezone: string
    time_field: string
    merge_policy: string
    generated_at: string
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
type ErrorResponse = { error?: { code?: string; message?: string } }

export async function fetchOverview(signal?: AbortSignal): Promise<OverviewResponse> {
  const response = await fetch("/api/v1/overview", { signal, headers: { Accept: "application/json" } })
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
