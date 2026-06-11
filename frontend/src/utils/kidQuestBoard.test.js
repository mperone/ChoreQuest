import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
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
  assert.deepEqual(groups.recent.map((item) => item.assignment_id), [4, 3])
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
