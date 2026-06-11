import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bestProgressDay,
  buildProgressSnapshot,
  displayNameForEntry,
  formatPercent,
  scoreForEntry,
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

test('scores and names leaderboard entries consistently', () => {
  assert.equal(scoreForEntry({ weekly_xp: 0, xp: 12 }), 12)
  assert.equal(scoreForEntry({ weekly_xp: 44, xp: 12 }), 44)
  assert.equal(scoreForEntry(null), 0)

  assert.equal(displayNameForEntry({ display_name: 'Mia', username: 'mia123' }), 'Mia')
  assert.equal(displayNameForEntry({ username: 'ollie' }), 'ollie')
  assert.equal(displayNameForEntry(null), 'Unknown')
})

test('builds a compact progress snapshot from loaded progress data', () => {
  const achievementSummary = {
    total: 5,
    unlockedCount: 2,
    recentUnlocked: [{ title: 'Helping Hand' }],
  }

  const snapshot = buildProgressSnapshot({
    entries: [
      { id: 1, display_name: 'Ari', weekly_xp: 35 },
      { id: 2, display_name: 'Mia', weekly_xp: 90, avatar_config: { head: 'round' } },
      { id: 3, username: 'jay', xp: 40 },
    ],
    summary: {
      total_xp: 240,
      avg_daily_xp: 8,
      total_completed: 18,
      total_assigned: 24,
      completion_rate: 0.75,
    },
    achievementSummary,
    bestDay: { date: '2026-06-10', xp: 55 },
  })

  assert.deepEqual(snapshot.xp, {
    label: '30-Day XP',
    value: 240,
    detail: '8 per day',
  })
  assert.deepEqual(snapshot.quests, {
    label: 'Quests Done',
    value: 18,
    detail: '24 assigned',
  })
  assert.deepEqual(snapshot.completion, {
    label: 'Completion',
    value: '75%',
    detail: 'required quests',
  })
  assert.equal(snapshot.leader.name, 'Mia')
  assert.equal(snapshot.leader.score, 90)
  assert.deepEqual(snapshot.leader.avatarConfig, { head: 'round' })
  assert.deepEqual(snapshot.achievement, {
    label: 'Rewards',
    value: '2/5',
    detail: 'Latest: Helping Hand',
  })
  assert.deepEqual(snapshot.bestDay, {
    label: 'Best Day',
    value: '55 XP',
    detail: '6/10',
  })
})

test('builds safe progress snapshot fallbacks for empty data', () => {
  const snapshot = buildProgressSnapshot()

  assert.equal(snapshot.xp.value, 0)
  assert.equal(snapshot.quests.detail, '0 assigned')
  assert.equal(snapshot.completion.value, '0%')
  assert.equal(snapshot.leader.name, 'No leader yet')
  assert.equal(snapshot.leader.score, 0)
  assert.equal(snapshot.achievement.value, '0/0')
  assert.equal(snapshot.achievement.detail, 'No achievements unlocked yet')
  assert.equal(snapshot.bestDay.value, '0 XP')
})
