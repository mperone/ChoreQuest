import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  kidBrowseActionForStatus,
  filterKidQuestItems,
  groupKidQuestAssignments,
  isDoneStatus,
} from './kidQuestBoard.js'

function assignment({
  id,
  choreId,
  title,
  date,
  status = 'pending',
  category = 'Room',
  difficulty = 'easy',
  isOptional = false,
  daypart = 'anytime',
  sortOrder = 0,
}) {
  return {
    id,
    chore_id: choreId,
    user_id: 2,
    date,
    status,
    requires_photo: false,
    is_optional: isOptional,
    chore: {
      id: choreId,
      title,
      description: `${title} description`,
      points: 10,
      difficulty,
      category: { name: category },
      requires_photo: false,
      is_optional: isOptional,
      daypart,
      sort_order: sortOrder,
    },
  }
}

test('groups kid quests by dated assignment instances', () => {
  const groups = groupKidQuestAssignments(
    [
      assignment({ id: 1, choreId: 10, title: 'Make bed', date: '2026-06-10' }),
      assignment({ id: 2, choreId: 10, title: 'Make bed', date: '2026-06-12' }),
      assignment({ id: 3, choreId: 11, title: 'Dishes', date: '2026-06-09', status: 'verified' }),
      assignment({ id: 4, choreId: 12, title: 'Old one-off', date: '2026-06-08', status: 'pending' }),
      { id: 5, date: '2026-06-10', status: 'pending' },
    ],
    '2026-06-10',
  )

  assert.deepEqual(groups.today.map((item) => item.assignment_id), [1])
  assert.deepEqual(groups.upcoming.map((item) => item.assignment_id), [2])
  assert.deepEqual(groups.recent.map((item) => item.assignment_id), [3, 4])
  assert.equal(groups.today[0].id, 10)
  assert.equal(groups.today[0].assignment_status, 'pending')
})

test('hides completed today quests until requested', () => {
  const groups = groupKidQuestAssignments(
    [
      assignment({ id: 1, choreId: 10, title: 'Make bed', date: '2026-06-10' }),
      assignment({ id: 2, choreId: 11, title: 'Dishes', date: '2026-06-10', status: 'completed' }),
      assignment({ id: 3, choreId: 12, title: 'Trash', date: '2026-06-10', status: 'verified' }),
    ],
    '2026-06-10',
  )

  const defaultItems = filterKidQuestItems(groups.today, {
    showCompleted: false,
  })
  const allItems = filterKidQuestItems(groups.today, {
    showCompleted: true,
  })

  assert.deepEqual(defaultItems.map((item) => item.assignment_id), [1])
  assert.deepEqual(allItems.map((item) => item.assignment_id), [1, 2, 3])
  assert.equal(isDoneStatus('completed'), true)
  assert.equal(isDoneStatus('verified'), true)
})

test('filters kid quest items by category and difficulty', () => {
  const groups = groupKidQuestAssignments(
    [
      assignment({ id: 1, choreId: 10, title: 'Make bed', date: '2026-06-10', category: 'Room', difficulty: 'easy' }),
      assignment({ id: 2, choreId: 11, title: 'Dishes', date: '2026-06-10', category: 'Kitchen', difficulty: 'hard' }),
    ],
    '2026-06-10',
  )

  const items = filterKidQuestItems(groups.today, {
    category: 'Kitchen',
    difficulty: 'hard',
    showCompleted: true,
  })

  assert.deepEqual(items.map((item) => item.assignment_id), [2])
})

test('keeps optional quest metadata and sorts required today quests first', () => {
  const groups = groupKidQuestAssignments(
    [
      assignment({ id: 1, choreId: 10, title: 'Bonus reading', date: '2026-06-10', isOptional: true }),
      assignment({ id: 2, choreId: 11, title: 'Make bed', date: '2026-06-10' }),
    ],
    '2026-06-10',
  )

  assert.deepEqual(groups.today.map((item) => item.assignment_id), [2, 1])
  assert.equal(groups.today[1].is_optional, true)
})

test('kid chores browse screen does not expose primary completion actions', () => {
  assert.equal(kidBrowseActionForStatus('pending'), 'View details')
  assert.equal(kidBrowseActionForStatus('needs_work'), 'View details')
  assert.equal(kidBrowseActionForStatus('completed'), 'View details')
  assert.equal(kidBrowseActionForStatus('verified'), 'View details')
})

test('orders kid today and upcoming items by daypart then manual order', () => {
  const groups = groupKidQuestAssignments(
    [
      assignment({ id: 1, choreId: 10, title: 'Evening', date: '2026-06-10', daypart: 'evening', sortOrder: 0 }),
      assignment({ id: 2, choreId: 11, title: 'Morning second', date: '2026-06-10', daypart: 'morning', sortOrder: 2 }),
      assignment({ id: 3, choreId: 12, title: 'Morning first', date: '2026-06-10', daypart: 'morning', sortOrder: 1 }),
      assignment({ id: 4, choreId: 13, title: 'Afternoon', date: '2026-06-11', daypart: 'afternoon', sortOrder: 0 }),
      assignment({ id: 5, choreId: 14, title: 'Tomorrow morning', date: '2026-06-11', daypart: 'morning', sortOrder: 0 }),
    ],
    '2026-06-10',
  )

  assert.deepEqual(groups.today.map((item) => item.title), [
    'Morning first',
    'Morning second',
    'Evening',
  ])
  assert.deepEqual(groups.upcoming.map((item) => item.title), [
    'Tomorrow morning',
    'Afternoon',
  ])
})

test('treats past pending kid quests as missed and sorts recent by date first', () => {
  const groups = groupKidQuestAssignments(
    [
      assignment({ id: 1, choreId: 10, title: 'Homework', date: '2026-06-10', status: 'pending', daypart: 'afternoon' }),
      assignment({ id: 2, choreId: 11, title: 'Homework', date: '2026-06-11', status: 'verified', daypart: 'afternoon' }),
      assignment({ id: 3, choreId: 12, title: 'Bonus Chore', date: '2026-06-11', status: 'verified', isOptional: true, daypart: 'anytime' }),
      assignment({ id: 4, choreId: 13, title: 'Make your Bed', date: '2026-06-10', status: 'verified', daypart: 'morning' }),
    ],
    '2026-06-12',
  )

  assert.deepEqual(groups.recent.map((item) => item.assignment_id), [2, 3, 1, 4])
  assert.equal(groups.recent[2].assignment_status, 'missed')
  assert.equal(groups.recent[2].assignment.status, 'pending')
})

test('treats past pending bonus kid quests as missed history', () => {
  const groups = groupKidQuestAssignments(
    [
      assignment({ id: 1, choreId: 10, title: 'Bonus reading', date: '2026-06-10', status: 'pending', isOptional: true }),
    ],
    '2026-06-12',
  )

  assert.equal(groups.recent[0].assignment_status, 'missed')
  assert.equal(isDoneStatus(groups.recent[0].assignment_status), true)
})
