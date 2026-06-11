import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  groupAssignmentsByChore,
  groupAssignmentsByKid,
  parentCalendarStatus,
} from './parentCalendarGroups.js'
import * as parentCalendarGroups from './parentCalendarGroups.js'

function assignment({
  id,
  choreId,
  title,
  userId,
  kid,
  status = 'pending',
  date = '2026-06-10',
  isOptional = false,
}) {
  return {
    id,
    chore_id: choreId,
    user_id: userId,
    date,
    status,
    is_optional: isOptional,
    chore: {
      id: choreId,
      title,
      points: 10,
      recurrence: 'daily',
      is_optional: isOptional,
    },
    user: {
      id: userId,
      display_name: kid,
      username: kid.toLowerCase(),
    },
  }
}

test('groups parent calendar assignments by chore for a day', () => {
  const groups = groupAssignmentsByChore([
    assignment({ id: 1, choreId: 10, title: 'Make Bed', userId: 2, kid: 'Mia' }),
    assignment({ id: 2, choreId: 10, title: 'Make Bed', userId: 3, kid: 'Ava', status: 'verified' }),
    assignment({ id: 3, choreId: 11, title: 'Dishes', userId: 2, kid: 'Mia', status: 'completed' }),
  ])

  assert.deepEqual(groups.map((group) => group.title), ['Dishes', 'Make Bed'])
  assert.deepEqual(
    groups[1].items.map((item) => [item.assignment.id, item.label, item.status]),
    [
      [2, 'Ava', 'verified'],
      [1, 'Mia', 'pending'],
    ],
  )
  assert.equal(groups[1].doneCount, 1)
  assert.equal(groups[1].totalCount, 2)
})

test('groups parent calendar assignments by kid for a day', () => {
  const groups = groupAssignmentsByKid([
    assignment({ id: 1, choreId: 10, title: 'Make Bed', userId: 2, kid: 'Mia' }),
    assignment({ id: 2, choreId: 11, title: 'Dishes', userId: 2, kid: 'Mia', status: 'completed' }),
    assignment({ id: 3, choreId: 10, title: 'Make Bed', userId: 3, kid: 'Ava', status: 'verified' }),
  ])

  assert.deepEqual(groups.map((group) => group.title), ['Ava', 'Mia'])
  assert.deepEqual(
    groups[1].items.map((item) => [item.assignment.id, item.label, item.status]),
    [
      [2, 'Dishes', 'completed'],
      [1, 'Make Bed', 'pending'],
    ],
  )
  assert.equal(groups[1].doneCount, 1)
  assert.equal(groups[1].totalCount, 2)
})

test('labels parent calendar statuses using the assignment date', () => {
  assert.deepEqual(parentCalendarStatus(
    assignment({ id: 1, choreId: 10, title: 'Make Bed', userId: 2, kid: 'Mia' }),
    '2026-06-10',
  ), { label: 'Due today', tone: 'due' })
  assert.deepEqual(parentCalendarStatus(
    assignment({ id: 5, choreId: 10, title: 'Make Bed', userId: 2, kid: 'Mia', date: '2026-06-11' }),
    '2026-06-10',
  ), { label: 'Scheduled', tone: 'scheduled' })
  assert.deepEqual(parentCalendarStatus(
    assignment({ id: 2, choreId: 10, title: 'Make Bed', userId: 2, kid: 'Mia', date: '2026-06-09' }),
    '2026-06-10',
  ), { label: 'Overdue', tone: 'overdue' })
  assert.deepEqual(parentCalendarStatus(
    assignment({ id: 3, choreId: 10, title: 'Make Bed', userId: 2, kid: 'Mia', status: 'completed' }),
    '2026-06-10',
  ), { label: 'Awaiting approval', tone: 'completed' })
  assert.deepEqual(parentCalendarStatus(
    assignment({ id: 4, choreId: 10, title: 'Make Bed', userId: 2, kid: 'Mia', status: 'verified' }),
    '2026-06-10',
  ), { label: 'Approved', tone: 'approved' })
  assert.deepEqual(parentCalendarStatus(
    assignment({ id: 6, choreId: 10, title: 'Make Bed', userId: 2, kid: 'Mia', status: 'skipped' }),
    '2026-06-10',
  ), { label: 'Skipped', tone: 'muted' })
  assert.deepEqual(parentCalendarStatus(
    assignment({ id: 7, choreId: 10, title: 'Make Bed', userId: 2, kid: 'Mia', status: 'missed', date: '2026-06-09' }),
    '2026-06-10',
  ), { label: 'Missed', tone: 'overdue' })
  assert.deepEqual(parentCalendarStatus(
    assignment({ id: 8, choreId: 10, title: 'Extra reading', userId: 2, kid: 'Mia', status: 'missed', date: '2026-06-09', isOptional: true }),
    '2026-06-10',
  ), { label: 'Bonus missed', tone: 'muted' })
})

test('does not label optional pending assignments as overdue', () => {
  const status = parentCalendarStatus(
    assignment({
      id: 1,
      choreId: 10,
      title: 'Extra reading',
      userId: 2,
      kid: 'Mia',
      date: '2026-06-09',
      isOptional: true,
    }),
    '2026-06-10',
  )

  assert.equal(status.label, 'Bonus')
  assert.equal(status.tone, 'optional')
})

test('defaults the parent calendar to grouping by kid', () => {
  assert.equal(parentCalendarGroups.DEFAULT_PARENT_CALENDAR_VIEW, 'kid')
})

test('maps parent calendar status tones to distinct semantic pill classes', () => {
  const classes = parentCalendarGroups.PARENT_STATUS_TONE_CLASSES

  assert.ok(classes, 'expected parent calendar status tone classes to be exported')
  assert.match(classes.optional, /\btext-gold\b/)
  assert.match(classes.due, /\btext-accent\b/)
  assert.match(classes.scheduled, /\btext-cyan-500\b/)
  assert.match(classes.overdue, /\btext-crimson\b/)
  assert.match(classes.completed, /\btext-emerald\b/)
  assert.match(classes.approved, /\btext-emerald\b/)
  assert.match(classes.muted, /\btext-muted\b/)

  assert.notEqual(classes.optional, classes.due)
  assert.notEqual(classes.optional, classes.scheduled)
  assert.notEqual(classes.due, classes.scheduled)
  assert.notEqual(classes.completed, classes.approved)
})
