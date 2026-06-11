export function formatPercent(rate) {
  return `${Math.round((rate || 0) * 100)}%`
}

export function bestProgressDay(days = []) {
  if (!Array.isArray(days) || days.length === 0) return null
  return days.reduce((best, day) => {
    if (!best || (day.xp || 0) > (best.xp || 0)) return day
    return best
  }, null)
}

export function scoreForEntry(entry = {}) {
  return entry?.weekly_xp || entry?.xp || 0
}

export function displayNameForEntry(entry = {}) {
  return entry?.display_name || entry?.username || 'Unknown'
}

function shortDate(dateStr) {
  if (!dateStr) return ''
  const [, month, day] = dateStr.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function buildProgressSnapshot({
  entries = [],
  summary = {},
  achievementSummary = {},
  bestDay = null,
} = {}) {
  const safeEntries = Array.isArray(entries) ? entries : []
  const safeSummary = summary || {}
  const safeAchievementSummary = achievementSummary || {}
  const recentAchievement = safeAchievementSummary.recentUnlocked?.[0] || null
  const recentAchievementTitle = recentAchievement
    ? recentAchievement.title || recentAchievement.name
    : null
  const leader = safeEntries.reduce((best, entry) => {
    if (!best || scoreForEntry(entry) > scoreForEntry(best)) return entry
    return best
  }, null)

  return {
    xp: {
      label: '30-Day XP',
      value: safeSummary.total_xp || 0,
      detail: `${safeSummary.avg_daily_xp || 0} per day`,
    },
    quests: {
      label: 'Quests Done',
      value: safeSummary.total_completed || 0,
      detail: `${safeSummary.total_assigned || 0} assigned`,
    },
    completion: {
      label: 'Completion',
      value: formatPercent(safeSummary.completion_rate),
      detail: 'required quests',
    },
    leader: leader
      ? {
          name: displayNameForEntry(leader),
          score: scoreForEntry(leader),
          avatarConfig: leader.avatar_config || null,
          detail: `${scoreForEntry(leader)} XP this week`,
        }
      : {
          name: 'No leader yet',
          score: 0,
          avatarConfig: null,
          detail: 'No XP earned this week',
        },
    achievement: {
      label: 'Rewards',
      value: `${safeAchievementSummary.unlockedCount || 0}/${safeAchievementSummary.total || 0}`,
      detail: recentAchievementTitle
        ? `Latest: ${recentAchievementTitle}`
        : 'No achievements unlocked yet',
    },
    bestDay: {
      label: 'Best Day',
      value: bestDay ? `${bestDay.xp || 0} XP` : '0 XP',
      detail: bestDay ? shortDate(bestDay.date) : 'No XP yet',
    },
  }
}

export function summarizeAchievements(achievements = []) {
  const items = Array.isArray(achievements) ? achievements : []
  const unlocked = items.filter((item) => item.unlocked)
  const locked = items.filter((item) => !item.unlocked)

  return {
    total: items.length,
    unlockedCount: unlocked.length,
    availableXp: items.reduce((sum, item) => sum + (item.points_reward || 0), 0),
    unlockedXp: unlocked.reduce((sum, item) => sum + (item.points_reward || 0), 0),
    recentUnlocked: unlocked
      .slice()
      .sort((a, b) => new Date(b.unlocked_at || 0) - new Date(a.unlocked_at || 0))
      .slice(0, 3),
    nextLocked: locked
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .slice(0, 3),
  }
}
