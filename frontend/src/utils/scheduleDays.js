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

export function formatSchedulePreviewDate(isoDate) {
  const weekday = DAY_NAMES[weekdayFromISODate(isoDate)]
  return `${weekday} ${formatScheduleDate(isoDate)}`
}

function parseISODate(isoDate) {
  const [year, month, day] = String(isoDate || '').split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(Date.UTC(year, month - 1, day))
}

function toISODate(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addCalendarDays(isoDate, days) {
  const date = parseISODate(isoDate)
  if (!date) return todayISO()
  date.setUTCDate(date.getUTCDate() + days)
  return toISODate(date)
}

function mondayWeekStart(isoDate) {
  const weekday = weekdayFromISODate(isoDate)
  return addCalendarDays(isoDate, -weekday)
}

function daysBetween(startDate, endDate) {
  const start = parseISODate(startDate)
  const end = parseISODate(endDate)
  if (!start || !end) return 0
  return Math.round((end.getTime() - start.getTime()) / 86400000)
}

function lastDayOfMonth(isoDate) {
  const date = parseISODate(isoDate)
  if (!date) return 31
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
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

export function scheduleShowsPreview(schedule) {
  let type = schedule?.schedule_type || schedule?.scheduleType || schedule?.recurrence || 'once'
  if (type === 'custom') type = 'weekly'
  return type !== 'once'
}

function dateMatchesSchedule(isoDate, schedule) {
  let type = schedule?.schedule_type || schedule?.scheduleType || schedule?.recurrence || 'once'
  if (type === 'custom') type = 'weekly'

  const startDate = schedule?.start_date || schedule?.startDate || todayISO()
  if (isoDate < startDate) return false

  if (type === 'once') return isoDate === startDate
  if (type === 'daily') return true

  if (type === 'monthly') {
    const monthDay = normalizeMonthDay(
      schedule?.month_day ?? schedule?.monthDay,
      startDate,
    )
    const day = monthDay === LAST_DAY_OF_MONTH
      ? lastDayOfMonth(isoDate)
      : monthDay
    return Number(String(isoDate).slice(8, 10)) === day
  }

  const weekdays = normalizeScheduleWeekdays(
    type,
    startDate,
    schedule?.weekdays || schedule?.custom_days || schedule?.customDays,
  )
  if (!weekdays?.includes(weekdayFromISODate(isoDate))) return false

  if (type === 'fortnightly') {
    const weeksDiff = daysBetween(mondayWeekStart(startDate), mondayWeekStart(isoDate)) / 7
    return weeksDiff % 2 === 0
  }

  return type === 'weekly'
}

export function buildSchedulePreview(schedule, count = 6) {
  const startDate = schedule?.start_date || schedule?.startDate || todayISO()
  const limit = Math.max(1, count)
  const preview = []
  let cursor = startDate
  let inspected = 0

  while (preview.length < limit && inspected < 370) {
    if (dateMatchesSchedule(cursor, schedule)) {
      preview.push(cursor)
    }
    cursor = addCalendarDays(cursor, 1)
    inspected += 1
  }

  return preview
}
