import { expect, test } from "vitest"
import { scrollTopToReveal, visibleRange } from "./virtual-window.ts"

test("renders only the rows in view plus overscan", () => {
  expect(visibleRange({ scrollTop: 0, viewport: 240, rowHeight: 24, count: 50_000, overscan: 5 })).toEqual({
    start: 0,
    end: 15,
  })
  expect(visibleRange({ scrollTop: 24_000, viewport: 240, rowHeight: 24, count: 50_000, overscan: 5 })).toEqual({
    start: 995,
    end: 1015,
  })
})

test("a partly visible row counts as visible", () => {
  expect(visibleRange({ scrollTop: 12, viewport: 24, rowHeight: 24, count: 10, overscan: 0 })).toEqual({
    start: 0,
    end: 2,
  })
})

test("the range never runs past the list", () => {
  expect(visibleRange({ scrollTop: 900, viewport: 240, rowHeight: 24, count: 40, overscan: 5 })).toEqual({
    start: 25,
    end: 40,
  })
  expect(visibleRange({ scrollTop: 0, viewport: 240, rowHeight: 24, count: 0, overscan: 5 })).toEqual({
    start: 0,
    end: 0,
  })
})

test("a scroll position past the end of a list that just shrank shows its last rows", () => {
  // Scrolled deep into 40 000 rows, then a search leaves 3.
  expect(visibleRange({ scrollTop: 480_000, viewport: 240, rowHeight: 24, count: 3, overscan: 5 })).toEqual({
    start: 0,
    end: 3,
  })
  expect(visibleRange({ scrollTop: 480_000, viewport: 240, rowHeight: 24, count: 100, overscan: 0 })).toEqual({
    start: 90,
    end: 100,
  })
})

test("revealing a row scrolls the least needed, or not at all", () => {
  const view = { scrollTop: 240, viewport: 240, rowHeight: 24 }
  expect(scrollTopToReveal({ ...view, index: 12 })).toBe(240) // already visible
  expect(scrollTopToReveal({ ...view, index: 3 })).toBe(72) // above: align to top
  expect(scrollTopToReveal({ ...view, index: 30 })).toBe(504) // below: align to bottom
})
