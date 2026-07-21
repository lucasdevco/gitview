export function compareSortValues(left: string, right: string, collator: Intl.Collator) {
  const leftNumber = parseNumericValue(left)
  const rightNumber = parseNumericValue(right)
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber
  return collator.compare(left, right)
}

export function parseNumericValue(value: string) {
  const normalized = value.trim().replaceAll(",", "").replace("−", "-").replace(/%$/, "")
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}
