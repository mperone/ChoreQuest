export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const LAST_DAY_OF_MONTH = -1

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

export function weekdayFromISODate(isoDate) {
  const [year, month, day] = String(isoDate || '').split('-').map(Number)
  if (!year || !month || !day) return 0

  const date = new Date(Date.UTC(year, month - 1, day))
  const jsDay = date.getUTCDay()
  return jsDay === 0 ? 6 : jsDay - 1
}

export function todayISO() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatScheduleDate(isoDate) {
  const [year, month, day] = String(isoDate || '').split('-').map(Number)
  if (!year || !month || !day) return 'today'

  return `${MONTH_NAMES[month - 1]} ${day}`
}

export function monthDayFromISODate(isoDate) {
  const day = Number(String(isoDate || '').split('-')[2])
  return day || 1
}

export function normalizeMonthDay(monthDay, startDate) {
  if (monthDay === LAST_DAY_OF_MONTH || Number(monthDay) === LAST_DAY_OF_MONTH) {
    return LAST_DAY_OF_MONTH
  }

  const numeric = Number(monthDay)
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 31) {
    return numeric
  }

  return monthDayFromISODate(startDate)
}

export function formatMonthDay(monthDay) {
  const normalized = Number(monthDay)
  if (normalized === LAST_DAY_OF_MONTH) return 'last day'

  const suffix =
    normalized % 100 >= 11 && normalized % 100 <= 13
      ? 'th'
      : ({ 1: 'st', 2: 'nd', 3: 'rd' }[normalized % 10] || 'th')

  return `${normalized}${suffix}`
}

export function normalizeScheduleWeekdays(scheduleType, startDate, weekdays) {
  if (scheduleType !== 'weekly' && scheduleType !== 'fortnightly') return null

  const normalized = normalizeScheduleDays(weekdays)
  return normalized.length > 0 ? normalized : [weekdayFromISODate(startDate)]
}

export function formatScheduleSummary(schedule) {
  let type = schedule?.schedule_type || schedule?.scheduleType || schedule?.recurrence || 'once'
  if (type === 'custom') type = 'weekly'

  const startDate = schedule?.start_date || schedule?.startDate || todayISO()
  const formattedDate = formatScheduleDate(startDate)

  if (type === 'once') {
    return `One time on ${formattedDate}`
  }
  if (type === 'daily') {
    return `Every day starting ${formattedDate}`
  }
  if (type === 'monthly') {
    const monthDay = normalizeMonthDay(
      schedule?.month_day ?? schedule?.monthDay,
      startDate,
    )
    return `Every month on the ${formatMonthDay(monthDay)} starting ${formattedDate}`
  }

  const weekdays = normalizeScheduleWeekdays(
    type,
    startDate,
    schedule?.weekdays || schedule?.custom_days || schedule?.customDays,
  )
  const dayList = formatScheduleDays(weekdays)

  if (type === 'fortnightly') {
    return `Every other week on ${dayList} starting ${formattedDate}`
  }

  return `Every week on ${dayList} starting ${formattedDate}`
}
