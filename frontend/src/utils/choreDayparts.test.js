import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DAYPART_ORDER,
  buildChoreReorderPayload,
  currentDaypartForDateInTimeZone,
  currentDaypartForHour,
  dailyDisplaySectionsForAssignments,
  groupChoresForParentOrdering,
  groupDailyAssignments,
  kidCompletionLabelForAssignment,
  moveChoreBetweenDayparts,
} from './choreDayparts.js'

function item({
  id,
  title,
  daypart = 'anytime',
  sortOrder = 0,
  status = 'pending',
  optional = false,
  date = '2026-06-11',
}) {
  return {
    assignment_id: id,
    id: id + 100,
    title,
    date,
    assignment_status: status,
    is_optional: optional,
    chore: {
      id: id + 100,
      title,
      daypart,
      sort_order: sortOrder,
      requires_photo: false,
    },
  }
}

test('maps clock hour to kid daypart', () => {
  assert.equal(currentDaypartForHour(5), 'morning')
  assert.equal(currentDaypartForHour(11), 'morning')
  assert.equal(currentDaypartForHour(12), 'afternoon')
  assert.equal(currentDaypartForHour(16), 'afternoon')
  assert.equal(currentDaypartForHour(17), 'evening')
  assert.equal(currentDaypartForHour(22), 'evening')
})

test('maps current daypart using the configured timezone', () => {
  const noonishUtc = new Date('2026-06-11T16:30:00Z')
  const eveningUtc = new Date('2026-06-11T22:30:00Z')

  assert.equal(currentDaypartForDateInTimeZone(noonishUtc, 'America/New_York'), 'afternoon')
  assert.equal(currentDaypartForDateInTimeZone(noonishUtc, 'America/Los_Angeles'), 'morning')
  assert.equal(currentDaypartForDateInTimeZone(eveningUtc, 'America/Chicago'), 'evening')
})

test('groups today chores into now, anytime, later, and bonus', () => {
  const groups = groupDailyAssignments(
    [
      item({ id: 1, title: 'Read', daypart: 'evening', sortOrder: 0 }),
      item({ id: 2, title: 'Make bed', daypart: 'morning', sortOrder: 0 }),
      item({ id: 3, title: 'Water plants', daypart: 'anytime', sortOrder: 0 }),
      item({ id: 4, title: 'Extra help', daypart: 'afternoon', optional: true }),
      item({ id: 5, title: 'Already done', daypart: 'morning', status: 'verified' }),
    ],
    { currentDaypart: 'morning' },
  )

  assert.deepEqual(groups.now.items.map((entry) => entry.title), ['Make bed'])
  assert.deepEqual(groups.anytime.items.map((entry) => entry.title), ['Water plants'])
  assert.deepEqual(groups.later.items.map((entry) => entry.title), ['Read'])
  assert.deepEqual(groups.bonus.items.map((entry) => entry.title), ['Extra help'])
  assert.equal(groups.requiredTotal, 4)
  assert.equal(groups.requiredDone, 1)
  assert.equal(groups.requiredLeft, 3)
})

test('hides empty daily groups and sorts by daypart order then sort order', () => {
  const groups = groupDailyAssignments(
    [
      item({ id: 1, title: 'Second', daypart: 'morning', sortOrder: 20 }),
      item({ id: 2, title: 'First', daypart: 'morning', sortOrder: 10 }),
    ],
    { currentDaypart: 'morning' },
  )

  const visible = Object.values(groups.sections).filter((section) => section.items.length > 0)

  assert.deepEqual(visible.map((section) => section.id), ['now'])
  assert.deepEqual(groups.now.items.map((entry) => entry.title), ['First', 'Second'])
})

test('keeps skipped required chores left and actionable', () => {
  const groups = groupDailyAssignments(
    [
      item({ id: 1, title: 'Try again', daypart: 'morning', status: 'skipped' }),
    ],
    { currentDaypart: 'morning' },
  )

  assert.deepEqual(groups.now.items.map((entry) => entry.title), ['Try again'])
  assert.equal(groups.requiredTotal, 1)
  assert.equal(groups.requiredDone, 0)
  assert.equal(groups.requiredLeft, 1)
  assert.equal(groups.nextUp.title, 'Try again')
})

test('uses Mark Done as the kid-facing completion action for every pending chore', () => {
  assert.equal(
    kidCompletionLabelForAssignment(item({ id: 1, title: 'No photo' })),
    'Mark Done',
  )
  assert.equal(
    kidCompletionLabelForAssignment({
      ...item({ id: 2, title: 'Photo chore' }),
      chore: {
        id: 102,
        title: 'Photo chore',
        daypart: 'morning',
        sort_order: 0,
        requires_photo: true,
      },
    }),
    'Mark Done',
  )
})

test('uses waiting copy after a kid marks a chore done', () => {
  assert.equal(
    kidCompletionLabelForAssignment(item({ id: 3, title: 'Done', status: 'completed' })),
    'Waiting for approval',
  )
  assert.equal(
    kidCompletionLabelForAssignment(item({ id: 4, title: 'Approved', status: 'verified' })),
    'Done',
  )
})

test('keeps completed and verified chores visible on the kid home display', () => {
  const sections = dailyDisplaySectionsForAssignments(
    [
      item({ id: 1, title: 'Ready', daypart: 'morning', sortOrder: 10 }),
      item({ id: 2, title: 'Waiting', daypart: 'morning', sortOrder: 20, status: 'completed' }),
      item({ id: 3, title: 'Approved', daypart: 'morning', sortOrder: 30, status: 'verified' }),
    ],
    { currentDaypart: 'morning' },
  )

  assert.deepEqual(sections.map((section) => section.id), ['now'])
  assert.deepEqual(
    sections[0].items.map((entry) => [
      entry.title,
      kidCompletionLabelForAssignment(entry),
    ]),
    [
      ['Ready', 'Mark Done'],
      ['Waiting', 'Waiting for approval'],
      ['Approved', 'Done'],
    ],
  )
})

test('routes past daypart pending chores to anytime', () => {
  const groups = groupDailyAssignments(
    [
      item({ id: 1, title: 'Pack lunch', daypart: 'morning' }),
    ],
    { currentDaypart: 'evening' },
  )

  assert.deepEqual(groups.now.items, [])
  assert.deepEqual(groups.anytime.items.map((entry) => entry.title), ['Pack lunch'])
  assert.deepEqual(groups.later.items, [])
  assert.equal(groups.requiredTotal, 1)
  assert.equal(groups.requiredLeft, 1)
  assert.equal(groups.nextUp.title, 'Pack lunch')
})

test('leaves completed optional chores out of totals and bonus', () => {
  const groups = groupDailyAssignments(
    [
      item({ id: 1, title: 'Bonus done', daypart: 'afternoon', optional: true, status: 'completed' }),
      item({ id: 2, title: 'Required done', daypart: 'morning', status: 'completed' }),
    ],
    { currentDaypart: 'morning' },
  )

  assert.deepEqual(groups.bonus.items, [])
  assert.equal(groups.requiredTotal, 1)
  assert.equal(groups.requiredDone, 1)
  assert.equal(groups.requiredLeft, 0)
})

test('chooses deterministic next up from sorted now, anytime, then later', () => {
  const withNow = groupDailyAssignments(
    [
      item({ id: 1, title: 'Now second', daypart: 'morning', sortOrder: 20 }),
      item({ id: 2, title: 'Anytime first', daypart: 'anytime', sortOrder: 0 }),
      item({ id: 3, title: 'Now first', daypart: 'morning', sortOrder: 10 }),
      item({ id: 4, title: 'Later first', daypart: 'afternoon', sortOrder: 0 }),
    ],
    { currentDaypart: 'morning' },
  )
  const withAnytime = groupDailyAssignments(
    [
      item({ id: 5, title: 'Later first', daypart: 'afternoon', sortOrder: 0 }),
      item({ id: 6, title: 'Anytime second', daypart: 'anytime', sortOrder: 20 }),
      item({ id: 7, title: 'Anytime first', daypart: 'anytime', sortOrder: 10 }),
    ],
    { currentDaypart: 'morning' },
  )
  const withLater = groupDailyAssignments(
    [
      item({ id: 8, title: 'Evening first', daypart: 'evening', sortOrder: 0 }),
      item({ id: 9, title: 'Afternoon second', daypart: 'afternoon', sortOrder: 20 }),
      item({ id: 10, title: 'Afternoon first', daypart: 'afternoon', sortOrder: 10 }),
    ],
    { currentDaypart: 'morning' },
  )

  assert.equal(withNow.nextUp.title, 'Now first')
  assert.equal(withAnytime.nextUp.title, 'Anytime first')
  assert.equal(withLater.nextUp.title, 'Afternoon first')
})

test('builds parent reorder payload from grouped chore ids', () => {
  const payload = buildChoreReorderPayload({
    morning: [3, 2],
    afternoon: [],
    evening: [9],
    anytime: [4],
  })

  assert.deepEqual(payload, {
    items: [
      { chore_id: 3, daypart: 'morning', sort_order: 0 },
      { chore_id: 2, daypart: 'morning', sort_order: 1 },
      { chore_id: 9, daypart: 'evening', sort_order: 0 },
      { chore_id: 4, daypart: 'anytime', sort_order: 0 },
    ],
  })
  assert.deepEqual(DAYPART_ORDER, ['morning', 'afternoon', 'evening', 'anytime'])
})

test('moves a chore within and across parent daypart groups', () => {
  const first = moveChoreBetweenDayparts(
    {
      morning: [1, 2, 3],
      afternoon: [],
      evening: [],
      anytime: [],
    },
    { choreId: 1, fromDaypart: 'morning', toDaypart: 'morning', toIndex: 2 },
  )

  assert.deepEqual(first.morning, [2, 3, 1])

  const second = moveChoreBetweenDayparts(
    {
      morning: [2, 3, 1],
      afternoon: [],
      evening: [],
      anytime: [4],
    },
    { choreId: 3, fromDaypart: 'morning', toDaypart: 'anytime', toIndex: 1 },
  )

  assert.deepEqual(second.morning, [2, 1])
  assert.deepEqual(second.anytime, [4, 3])
})

test('moves a chore from its current group when captured source is stale', () => {
  const moved = moveChoreBetweenDayparts(
    {
      morning: [1],
      afternoon: [2, 3],
      evening: [],
      anytime: [4],
    },
    { choreId: 3, fromDaypart: 'morning', toDaypart: 'anytime', toIndex: 1 },
  )

  assert.deepEqual(moved.morning, [1])
  assert.deepEqual(moved.afternoon, [2])
  assert.deepEqual(moved.anytime, [4, 3])

  const movedIds = DAYPART_ORDER.flatMap((daypart) => moved[daypart])
  assert.equal(movedIds.filter((id) => id === 3).length, 1)
})

test('groups parent chores by daypart sorted by sort order then title', () => {
  const groups = groupChoresForParentOrdering([
    { id: 1, title: 'Wash cups', daypart: 'morning', sort_order: 20 },
    { id: 2, title: 'Fold towels', daypart: 'morning', sort_order: 10 },
    { id: 3, title: 'Dust shelves', daypart: 'morning', sort_order: 10 },
    { id: 4, title: 'Sweep porch', daypart: 'nonsense', sort_order: 0 },
    { id: 5, title: 'Set table', daypart: 'evening', sort_order: 0 },
  ])

  assert.deepEqual(groups.morning.map((chore) => chore.id), [3, 2, 1])
  assert.deepEqual(groups.evening.map((chore) => chore.id), [5])
  assert.deepEqual(groups.anytime.map((chore) => chore.id), [4])
})
