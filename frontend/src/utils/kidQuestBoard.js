import { compareDailyItems } from './choreDayparts.js'

const ACTIONABLE_STATUSES = new Set(['pending', 'assigned'])
const DONE_STATUSES = new Set(['completed', 'verified', 'skipped', 'missed'])
const MISSABLE_STATUSES = new Set(['pending', 'assigned'])

export function isActionableStatus(status) {
  return ACTIONABLE_STATUSES.has(status || 'pending')
}

export function isDoneStatus(status) {
  return DONE_STATUSES.has(status)
}

export function kidBrowseActionForStatus(status) {
  return 'View details'
}

function effectiveKidAssignmentStatus(status, assignmentDate, today) {
  if (assignmentDate < today && MISSABLE_STATUSES.has(status || 'pending')) {
    return 'missed'
  }
  return status || 'pending'
}

function normalizeKidQuestAssignment(assignment, today) {
  const chore = assignment?.chore
  const date = assignment?.date || assignment?.assigned_date || assignment?.due_date
  if (!chore || !date) return null

  const rawStatus = assignment.status || 'pending'
  const status = effectiveKidAssignmentStatus(rawStatus, date, today)

  return {
    ...chore,
    id: chore.id ?? assignment.chore_id,
    requires_photo: assignment.requires_photo ?? chore.requires_photo ?? false,
    is_optional: !!(assignment.is_optional || chore.is_optional),
    assignment_id: assignment.id,
    assignment_date: date,
    assignment_raw_status: rawStatus,
    assignment_status: status,
    assignment_user_id: assignment.user_id,
    assignment,
  }
}

function compareByDateThenId(a, b) {
  const dateCompare = a.assignment_date.localeCompare(b.assignment_date)
  if (dateCompare !== 0) return dateCompare
  return compareDailyItems(a, b) || (a.assignment_id || 0) - (b.assignment_id || 0)
}

function compareToday(a, b) {
  const rankA = isActionableStatus(a.assignment_status) ? 0 : 1
  const rankB = isActionableStatus(b.assignment_status) ? 0 : 1
  if (rankA !== rankB) return rankA - rankB
  const optionalCompare = Number(a.is_optional) - Number(b.is_optional)
  if (optionalCompare !== 0) return optionalCompare
  return compareDailyItems(a, b) || compareByDateThenId(a, b)
}

function compareRecent(a, b) {
  const dateCompare = b.assignment_date.localeCompare(a.assignment_date)
  if (dateCompare !== 0) return dateCompare

  const rankA = a.assignment_status === 'missed' ? 0 : 1
  const rankB = b.assignment_status === 'missed' ? 0 : 1
  if (rankA !== rankB) return rankA - rankB

  return compareDailyItems(a, b) || (b.assignment_id || 0) - (a.assignment_id || 0)
}

export function groupKidQuestAssignments(assignments, today) {
  const groups = {
    today: [],
    upcoming: [],
    recent: [],
  }

  for (const assignment of assignments || []) {
    const item = normalizeKidQuestAssignment(assignment, today)
    if (!item) continue

    if (item.assignment_date === today) {
      groups.today.push(item)
    } else if (item.assignment_date > today && isActionableStatus(item.assignment_status)) {
      groups.upcoming.push(item)
    } else if (item.assignment_date < today || isDoneStatus(item.assignment_status)) {
      groups.recent.push(item)
    }
  }

  groups.today.sort(compareToday)
  groups.upcoming.sort(compareByDateThenId)
  groups.recent.sort(compareRecent)

  return groups
}

export function filterKidQuestItems(
  items,
  { category = '', difficulty = '', showCompleted = true } = {},
) {
  return (items || []).filter((item) => {
    if (category && item.category?.name !== category) return false
    if (difficulty && item.difficulty !== difficulty) return false
    if (!showCompleted && isDoneStatus(item.assignment_status)) return false
    return true
  })
}
