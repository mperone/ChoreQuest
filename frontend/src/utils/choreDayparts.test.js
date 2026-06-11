import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DAYPART_ORDER,
  buildChoreReorderPayload,
  currentDaypartForHour,
  groupDailyAssignments,
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
