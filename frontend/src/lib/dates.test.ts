import { expect, test } from "vitest"
import { formatRelativeDate } from "./dates.ts"

// Dates are built in local time, the time zone the user sees.
const now = new Date(2026, 10, 12, 21, 30)

test("today shows 今天 with the time", () => {
  expect(formatRelativeDate(new Date(2026, 10, 12, 9, 5), now)).toBe("今天 09:05")
  expect(formatRelativeDate(new Date(2026, 10, 12, 0, 0), now)).toBe("今天 00:00")
})

test("yesterday shows 昨天 with the time, even less than 24 hours ago", () => {
  expect(formatRelativeDate(new Date(2026, 10, 11, 23, 59), now)).toBe("昨天 23:59")
  expect(formatRelativeDate(new Date(2026, 10, 11, 0, 1), now)).toBe("昨天 00:01")
})

test("older dates show the full date", () => {
  expect(formatRelativeDate(new Date(2026, 10, 10, 18, 7), now)).toBe("2026年11月10日 18:07")
  expect(formatRelativeDate(new Date(2025, 0, 3, 8, 0), now)).toBe("2025年1月3日 08:00")
})

test("yesterday across a month and year boundary", () => {
  const newYear = new Date(2027, 0, 1, 8, 0)
  expect(formatRelativeDate(new Date(2026, 11, 31, 22, 15), newYear)).toBe("昨天 22:15")
})

test("future dates (clock skew) show the full date", () => {
  expect(formatRelativeDate(new Date(2026, 10, 13, 10, 0), now)).toBe("2026年11月13日 10:00")
})
