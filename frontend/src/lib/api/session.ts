// The gitview server prints a URL carrying a per-run access token
// (?token=...). The page takes it from the address once, keeps it for the
// browser tab, and removes it from the address bar.

const STORAGE_KEY = "gitview.token"

type TokenStorage = Pick<Storage, "getItem" | "setItem">

export type Session = {
  token: string | null
  /** The address to show, with the token removed. */
  url: string
}

export function takeSessionToken(href: string, storage: TokenStorage): Session {
  const url = new URL(href)
  const fromUrl = url.searchParams.get("token")
  if (!fromUrl) return { token: storage.getItem(STORAGE_KEY), url: href }
  storage.setItem(STORAGE_KEY, fromUrl)
  url.searchParams.delete("token")
  return { token: fromUrl, url: url.toString() }
}
