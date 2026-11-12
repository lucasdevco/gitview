// Date display in the Sourcetree style, in the browser's local time zone.

const pad = (value: number) => String(value).padStart(2, "0")

const DAY_MS = 86_400_000

function calendarDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
}

/**
 * "今天 HH:mm" for a date on `now`'s calendar day, "昨天 HH:mm" for the day
 * before, otherwise "YYYY年M月D日 HH:mm".
 */
export function formatRelativeDate(date: Date, now: Date = new Date()): string {
  const days = calendarDay(now) - calendarDay(date)
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (days === 0) return `今天 ${time}`
  if (days === 1) return `昨天 ${time}`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}
