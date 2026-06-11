export const DEFAULT_DAILY_ROLLOVER_TIMEZONE = 'America/Chicago'

function formatterForTimezone(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || DEFAULT_DAILY_ROLLOVER_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_DAILY_ROLLOVER_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }
}

export function isoDateInTimeZone(date, timeZone) {
  const parts = formatterForTimezone(timeZone).formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return `${values.year}-${values.month}-${values.day}`
}

export function todayISOInTimeZone(timeZone, now = new Date()) {
  return isoDateInTimeZone(now, timeZone)
}
