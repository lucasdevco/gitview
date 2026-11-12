// HTTP client for the gitview API. Every request carries the session token;
// failures surface as ApiError with the server's error code and message.

/** A failed API request. `status` is 0 when the server could not be reached. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
  }
}

export type ApiClient = {
  /** GET an API path and return the response's `data`. */
  get<T>(path: string, signal?: AbortSignal): Promise<T>
}

export type ApiClientOptions = {
  token: string | null
  fetch?: typeof fetch
}

export function createApiClient({ token, fetch: fetchImpl = globalThis.fetch }: ApiClientOptions): ApiClient {
  return {
    async get<T>(path: string, signal?: AbortSignal): Promise<T> {
      if (!token) {
        throw new ApiError(
          401,
          "missing_token",
          "缺少访问令牌。请打开 gitview 启动时在终端打印的链接（带有 ?token=）。",
        )
      }
      let response: Response
      try {
        response = await fetchImpl.call(globalThis, path, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal,
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error
        throw new ApiError(0, "network_error", "无法连接 gitview 服务。请确认 gitview 仍在运行。")
      }
      const body = await response.json().catch(() => undefined)
      if (!response.ok) {
        const envelope = body?.error
        if (typeof envelope?.code === "string" && typeof envelope?.message === "string") {
          throw new ApiError(response.status, envelope.code, envelope.message)
        }
        throw new ApiError(response.status, "http_error", `请求失败（HTTP ${response.status}）。`)
      }
      return body?.data as T
    },
  }
}
