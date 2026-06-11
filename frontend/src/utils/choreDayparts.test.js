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
