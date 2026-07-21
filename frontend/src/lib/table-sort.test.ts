import { expect, test } from "vitest"

import { compareSortValues, parseNumericValue } from "./table-sort.ts"

const collator = new Intl.Collator("en-US", { numeric: true, sensitivity: "base" })

test("parses formatted numeric table values", () => {
  expect(parseNumericValue("1,234")).toBe(1234)
  expect(parseNumericValue("−42")).toBe(-42)
  expect(parseNumericValue("81.5%")).toBe(81.5)
  expect(parseNumericValue("2026-07-21")).toBeNull()
})

test("sorts timestamp sort values chronologically", () => {
  const earlier = String(Date.parse("2025-12-31T23:00:00Z"))
  const later = String(Date.parse("2026-01-01T01:00:00Z"))
  expect(compareSortValues(earlier, later, collator)).toBeLessThan(0)
  expect(compareSortValues(later, earlier, collator)).toBeGreaterThan(0)
})
