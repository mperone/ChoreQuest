import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bestProgressDay,
  formatPercent,
  summarizeAchievements,
} from './progressDashboard.js'

test('summarizes unlocked and next achievements', () => {
  const summary = summarizeAchievements([
    {
      id: 1,
      title: 'First Quest',
      points_reward: 10,
      unlocked: true,
      unlocked_at: '2026-06-08T12:00:00Z',
      sort_order: 2,
    },
    {
      id: 2,
      title: 'Streak Starter',
      points_reward: 25,
      unlocked: false,
      sort_order: 1,
    },
    {
      id: 3,
      title: 'Helper',
      points_reward: 15,
      unlocked: true,
      unlocked_at: '2026-06-10T12:00:00Z',
      sort_order: 3,
    },
  ])

  assert.equal(summary.total, 3)
  assert.equal(summary.unlockedCount, 2)
  assert.equal(summary.availableXp, 50)
  assert.equal(summary.unlockedXp, 25)
  assert.deepEqual(summary.recentUnlocked.map((item) => item.title), ['Helper', 'First Quest'])
  assert.deepEqual(summary.nextLocked.map((item) => item.title), ['Streak Starter'])
})

test('finds the best XP day in a progress window', () => {
  const day = bestProgressDay([
    { date: '2026-06-08', xp: 5 },
    { date: '2026-06-09', xp: 25 },
    { date: '2026-06-10', xp: 10 },
  ])

  assert.deepEqual(day, { date: '2026-06-09', xp: 25 })
})

test('formats completion rates consistently', () => {
  assert.equal(formatPercent(0.734), '73%')
  assert.equal(formatPercent(null), '0%')
})
