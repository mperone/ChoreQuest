export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function normalizeScheduleDays(days) {
  if (!Array.isArray(days)) return []

  return [...new Set(days)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day < DAY_NAMES.length)
    .sort((a, b) => a - b)
}

export function formatScheduleDays(days) {
  return normalizeScheduleDays(days)
    .map((day) => DAY_NAMES[day])
    .join(', ')
}
