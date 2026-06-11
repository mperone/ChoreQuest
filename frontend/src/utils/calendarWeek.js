export function toISO(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(dateStr, n) {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + n)
  return toISO(date)
}

export function sundayWeekStart(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`)
  return addDays(dateStr, -date.getDay())
}

export function mondayWeekStart(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`)
  const day = date.getDay()
  return addDays(dateStr, day === 0 ? -6 : 1 - day)
}

export function backendMondayWeekStartsForSundayWeek(sundayStart) {
  return [
    addDays(sundayStart, -6),
    addDays(sundayStart, 1),
  ]
}
