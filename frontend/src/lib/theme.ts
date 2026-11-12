// 跟随系统: the page is dark exactly while the system colour scheme is.

type SchemeQuery = Pick<MediaQueryList, "matches"> & {
  addEventListener(type: "change", listener: (event: { matches: boolean }) => void): void
  removeEventListener(type: "change", listener: (event: { matches: boolean }) => void): void
}

/**
 * Sets the `dark` class on `root` from `media` (the result of
 * `matchMedia("(prefers-color-scheme: dark)")`) now and whenever the system
 * scheme changes. Returns a function that stops following it.
 */
export function followSystemTheme(
  root: { classList: Pick<DOMTokenList, "toggle"> },
  media: SchemeQuery = window.matchMedia("(prefers-color-scheme: dark)"),
): () => void {
  const apply = ({ matches }: { matches: boolean }) => {
    root.classList.toggle("dark", matches)
  }
  apply(media)
  media.addEventListener("change", apply)
  return () => media.removeEventListener("change", apply)
}
