// Fixed-height list virtualization: render only the rows in view.

/** Rows [start, end) to render for a scroll position, with `overscan` extra rows on each side. */
export function visibleRange({
  scrollTop,
  viewport,
  rowHeight,
  count,
  overscan,
}: {
  scrollTop: number
  viewport: number
  rowHeight: number
  count: number
  overscan: number
}): { start: number; end: number } {
  // The browser clamps scrollTop when the list shrinks, possibly without a scroll event; clamp too.
  const top = Math.max(0, Math.min(scrollTop, count * rowHeight - viewport))
  const first = Math.floor(top / rowHeight)
  const last = Math.ceil((top + viewport) / rowHeight)
  return { start: Math.max(0, Math.min(count, first - overscan)), end: Math.max(0, Math.min(count, last + overscan)) }
}

/** The scroll position that brings row `index` into view with the least movement. */
export function scrollTopToReveal({
  index,
  scrollTop,
  viewport,
  rowHeight,
}: {
  index: number
  scrollTop: number
  viewport: number
  rowHeight: number
}): number {
  const top = index * rowHeight
  const bottom = top + rowHeight
  if (top < scrollTop) return top
  if (bottom > scrollTop + viewport) return Math.max(0, bottom - viewport)
  return scrollTop
}
