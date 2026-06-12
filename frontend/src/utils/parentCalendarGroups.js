import { compareDailyItems } from './choreDayparts.js'

const DONE_STATUSES = new Set(['completed', 'verified', 'skipped'])

export const DEFAULT_PARENT_CALENDAR_VIEW = 'kid'

export const PARENT_STATUS_TONE_CLASSES = {
  due: 'text-accent border-accent/30 bg-accent/10',
  scheduled: 'text-cyan-500 border-cyan-500/30 bg-cyan-500/10',
  overdue: 'text-crimson border-crimson/30 bg-crimson/10',
  completed: 'text-emerald border-emerald/30 bg-emerald/10',
  approved: 'text-emerald border-emerald/45 bg-emerald/15',
  muted: 'text-muted border-border bg-surface-raised/40',
  optional: 'text-gold border-gold/30 bg-gold/10',
}

function assignmentTitle(assignment) {
  return assignment?.chore?.title || assignment?.chore_title || 'Quest'
}

function kidName(assignment) {
  return (
    assignment?.user?.display_name ||
    assignment?.assigned_to_name ||
    assignment?.user?.username ||
    `Kid #${assignment?.user_id || '?'}`
  )
}

function compareLabels(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

function isDone(status) {
  return DONE_STATUSES.has(status)
}

function toRow(assignment, label) {
  return {
    assignment,
    label,
    status: assignment.status || 'pending',
  }
}

function isOptional(assignment) {
  return !!(assignment?.is_optional || assignment?.chore?.is_optional)
}

function summarizeGroup(group) {
  group.items.sort((a, b) => {
    if (group.kind === 'kid') {
      return compareDailyItems(a.assignment, b.assignment) || compareLabels(a.label, b.label)
    }
    return compareLabels(a.label, b.label)
  })
  group.totalCount = group.items.length
  group.doneCount = group.items.filter((item) => isDone(item.status)).length
  return group
}

function compareChoreGroups(a, b) {
  return (
    compareDailyItems(
      { chore: a.chore || { title: a.title }, id: a.chore_id },
      { chore: b.chore || { title: b.title }, id: b.chore_id },
    )
    || compareLabels(a.title, b.title)
  )
}

export function groupAssignmentsByChore(assignments) {
  const groups = new Map()

  for (const assignment of assignments || []) {
    const choreId = assignment.chore_id || assignment.chore?.id || assignment.id
    const key = String(choreId)
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        kind: 'chore',
        title: assignmentTitle(assignment),
        chore: assignment.chore || null,
        chore_id: choreId,
        items: [],
      })
    }
    groups.get(key).items.push(toRow(assignment, kidName(assignment)))
  }

  return Array.from(groups.values())
    .map(summarizeGroup)
    .sort(compareChoreGroups)
}

export function groupAssignmentsByKid(assignments) {
  const groups = new Map()

  for (const assignment of assignments || []) {
    const userId = assignment.user_id || assignment.user?.id || assignment.id
    const key = String(userId)
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        kind: 'kid',
        title: kidName(assignment),
        user: assignment.user || null,
        user_id: userId,
        items: [],
      })
    }
    groups.get(key).items.push(toRow(assignment, assignmentTitle(assignment)))
  }

  return Array.from(groups.values())
    .map(summarizeGroup)
    .sort((a, b) => compareLabels(a.title, b.title))
}

export function parentCalendarStatus(assignment, today) {
  const status = assignment?.status || 'pending'
  if (status === 'verified') {
    return { label: 'Approved', tone: 'approved' }
  }
  if (status === 'completed') {
    return { label: 'Awaiting approval', tone: 'completed' }
  }
  if (status === 'skipped') {
    return { label: 'Skipped', tone: 'muted' }
  }
  if (status === 'missed') {
    return isOptional(assignment)
      ? { label: 'Bonus missed', tone: 'muted' }
      : { label: 'Missed', tone: 'overdue' }
  }
  if (isOptional(assignment)) {
    return { label: 'Bonus', tone: 'optional' }
  }
  if (assignment?.date < today) {
    return { label: 'Overdue', tone: 'overdue' }
  }
  if (assignment?.date === today) {
    return { label: 'Due today', tone: 'due' }
  }
  return { label: 'Scheduled', tone: 'scheduled' }
}
