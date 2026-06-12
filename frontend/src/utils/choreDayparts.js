export const DAYPART_ORDER = ['morning', 'afternoon', 'evening', 'anytime']

export const DAYPART_LABELS = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  anytime: 'Anytime',
}

export const DAILY_SECTION_META = {
  now: { id: 'now', title: 'Now' },
  anytime: { id: 'anytime', title: 'Anytime' },
  later: { id: 'later', title: 'Later' },
  bonus: { id: 'bonus', title: 'Bonus' },
}

const REQUIRED_DONE_STATUSES = new Set(['completed', 'verified'])
const HOME_VISIBLE_DONE_STATUSES = new Set(['completed', 'verified'])

export function currentDaypartForHour(hour) {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function normaliseDaypart(value) {
  return DAYPART_ORDER.includes(value) ? value : 'anytime'
}

function choreFromAssignment(item) {
  return item?.chore || item || {}
}

function assignmentStatus(item) {
  return item.assignment_status || item.status || 'pending'
}

function isDone(item) {
  return REQUIRED_DONE_STATUSES.has(assignmentStatus(item))
}

export function kidCompletionLabelForAssignment(item) {
  const status = assignmentStatus(item)
  if (status === 'verified') return 'Done'
  if (status === 'completed') return 'Waiting for approval'
  if (status === 'needs_work') return 'Try Again'
  if (status === 'skipped') return 'Skipped'
  return 'Mark Done'
}

function isOptional(item) {
  const chore = choreFromAssignment(item)
  return Boolean(item.is_optional ?? chore.is_optional)
}

function assignmentKey(item) {
  return item.assignment_id || item.id || item.chore_id
}

function daypartRank(daypart) {
  const index = DAYPART_ORDER.indexOf(normaliseDaypart(daypart))
  return index === -1 ? DAYPART_ORDER.length : index
}

function sortDailyItems(items) {
  return [...items].sort((a, b) => {
    const choreA = choreFromAssignment(a)
    const choreB = choreFromAssignment(b)
    return (
      daypartRank(choreA.daypart) - daypartRank(choreB.daypart)
      || Number(choreA.sort_order || 0) - Number(choreB.sort_order || 0)
      || String(choreA.title || a.title || '').localeCompare(String(choreB.title || b.title || ''))
    )
  })
}

function sectionIdForAssignment(item, activeDaypart) {
  if (isOptional(item)) return DAILY_SECTION_META.bonus.id

  const chore = choreFromAssignment(item)
  const daypart = normaliseDaypart(chore.daypart)

  if (daypart === activeDaypart) return DAILY_SECTION_META.now.id
  if (daypart === 'anytime') return DAILY_SECTION_META.anytime.id
  if (daypartRank(daypart) > daypartRank(activeDaypart)) return DAILY_SECTION_META.later.id
  return DAILY_SECTION_META.anytime.id
}

export function dailyDisplaySectionsForAssignments(items, { currentDaypart } = {}) {
  const activeDaypart = normaliseDaypart(currentDaypart)
  const dailyGroups = groupDailyAssignments(items, { currentDaypart: activeDaypart })
  const sections = Object.fromEntries(
    Object.values(DAILY_SECTION_META).map((meta) => [
      meta.id,
      { ...meta, items: [...(dailyGroups.sections?.[meta.id]?.items || [])] },
    ]),
  )
  const includedKeys = new Set(
    Object.values(sections).flatMap((section) => section.items.map((item) => assignmentKey(item))),
  )
  const doneItemsBySection = Object.fromEntries(
    Object.values(DAILY_SECTION_META).map((meta) => [meta.id, []]),
  )

  for (const item of items || []) {
    if (!HOME_VISIBLE_DONE_STATUSES.has(assignmentStatus(item))) continue

    const key = assignmentKey(item)
    if (includedKeys.has(key)) continue

    const sectionId = sectionIdForAssignment(item, activeDaypart)
    doneItemsBySection[sectionId].push(item)
    includedKeys.add(key)
  }

  for (const section of Object.values(sections)) {
    section.items = [
      ...section.items,
      ...sortDailyItems(doneItemsBySection[section.id] || []),
    ]
  }

  return Object.values(DAILY_SECTION_META)
    .map((meta) => sections[meta.id])
    .filter((section) => section.items.length > 0)
}

export function groupDailyAssignments(items, { currentDaypart } = {}) {
  const activeDaypart = normaliseDaypart(currentDaypart)
  const sections = {
    now: { ...DAILY_SECTION_META.now, items: [] },
    anytime: { ...DAILY_SECTION_META.anytime, items: [] },
    later: { ...DAILY_SECTION_META.later, items: [] },
    bonus: { ...DAILY_SECTION_META.bonus, items: [] },
  }

  let requiredDone = 0
  let requiredTotal = 0

  for (const item of items || []) {
    const chore = choreFromAssignment(item)
    const daypart = normaliseDaypart(chore.daypart)
    const optional = isOptional(item)
    const done = isDone(item)
    const futureRequired = daypart !== 'anytime' && daypartRank(daypart) > daypartRank(activeDaypart)

    if (optional) {
      if (!done) sections.bonus.items.push(item)
      continue
    }

    requiredTotal += 1

    if (done) {
      requiredDone += 1
      continue
    }

    if (daypart === activeDaypart) {
      sections.now.items.push(item)
    } else if (daypart === 'anytime') {
      sections.anytime.items.push(item)
    } else if (futureRequired) {
      sections.later.items.push(item)
    } else {
      sections.anytime.items.push(item)
    }
  }

  for (const section of Object.values(sections)) {
    section.items = sortDailyItems(section.items)
  }

  return {
    ...sections,
    sections,
    requiredDone,
    requiredTotal,
    requiredLeft: Math.max(0, requiredTotal - requiredDone),
    nextUp: sections.now.items[0] || sections.anytime.items[0] || sections.later.items[0] || null,
  }
}

export function groupChoresForParentOrdering(chores) {
  const groups = Object.fromEntries(DAYPART_ORDER.map((daypart) => [daypart, []]))
  for (const chore of chores || []) {
    const daypart = normaliseDaypart(chore.daypart)
    groups[daypart].push(chore)
  }
  for (const daypart of DAYPART_ORDER) {
    groups[daypart].sort((a, b) => (
      Number(a.sort_order || 0) - Number(b.sort_order || 0)
      || String(a.title || '').localeCompare(String(b.title || ''))
    ))
  }
  return groups
}

export function moveChoreBetweenDayparts(groups, move) {
  const next = Object.fromEntries(
    DAYPART_ORDER.map((daypart) => [daypart, [...(groups[daypart] || [])]]),
  )
  const toDaypart = normaliseDaypart(move.toDaypart)
  const choreId = Number(move.choreId)

  for (const daypart of DAYPART_ORDER) {
    next[daypart] = next[daypart].filter((id) => Number(id) !== choreId)
  }
  const boundedIndex = Math.max(0, Math.min(Number(move.toIndex), next[toDaypart].length))
  next[toDaypart].splice(boundedIndex, 0, choreId)

  return next
}

export function buildChoreReorderPayload(groupedIds) {
  return {
    items: DAYPART_ORDER.flatMap((daypart) => (
      (groupedIds[daypart] || []).map((choreId, index) => ({
        chore_id: Number(choreId),
        daypart,
        sort_order: index,
      }))
    )),
  }
}
