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

function entryMatchesUser(entry, currentUserId) {
  if (currentUserId == null) return false
  return entry?.user_id === currentUserId || entry?.id === currentUserId
}

function shortDate(dateStr) {
  if (!dateStr) return ''
  const [, month, day] = dateStr.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function buildProgressSnapshot({
  currentUserId = null,
  entries = [],
  summary = {},
  achievementSummary = {},
  bestDay = null,
  viewerRole = 'parent',
} = {}) {
  const safeEntries = Array.isArray(entries) ? entries : []
  const safeSummary = summary || {}
  const safeAchievementSummary = achievementSummary || {}
  const completed = safeSummary.total_completed || 0
  const assigned = safeSummary.total_assigned || 0
  const completion = formatPercent(safeSummary.completion_rate)
  const assignedProgress = {
    label: 'Assigned Progress',
    value: `${completed}/${assigned}`,
    detail: `${completion} complete`,
  }
  const recentAchievement = safeAchievementSummary.recentUnlocked?.[0] || null
  const recentAchievementTitle = recentAchievement
    ? recentAchievement.title || recentAchievement.name
    : null
  const leader = safeEntries.reduce((best, entry) => {
    if (!best || scoreForEntry(entry) > scoreForEntry(best)) return entry
    return best
  }, null)
  const currentEntryIndex = safeEntries.findIndex((entry) => entryMatchesUser(entry, currentUserId))
  const currentEntry = currentEntryIndex >= 0 ? safeEntries[currentEntryIndex] : null
  const currentRank = currentEntry
    ? currentEntry.rank || currentEntryIndex + 1
    : null
  const leaderSnapshot = leader
    ? {
        label: 'Weekly Leader',
        name: displayNameForEntry(leader),
        score: scoreForEntry(leader),
        avatarConfig: leader.avatar_config || null,
        detail: `${scoreForEntry(leader)} XP this week`,
      }
    : {
        label: 'Weekly Leader',
        name: 'No leader yet',
        score: 0,
        avatarConfig: null,
        detail: 'No XP earned this week',
      }
  const currentUserSnapshot = currentEntry
    ? {
        label: 'Your Week',
        name: displayNameForEntry(currentEntry),
        score: scoreForEntry(currentEntry),
        avatarConfig: currentEntry.avatar_config || null,
        detail: `#${currentRank} - ${scoreForEntry(currentEntry)} XP this week`,
      }
    : {
        label: 'Your Week',
        name: 'No XP yet',
        score: 0,
        avatarConfig: null,
        detail: 'Complete quests to join the standings',
      }
  const isKid = viewerRole === 'kid'

  return {
    title: isKid ? 'My Snapshot' : 'Family Snapshot',
    xp: {
      label: '30-Day XP',
      value: safeSummary.total_xp || 0,
      detail: `${safeSummary.avg_daily_xp || 0} per day`,
    },
    assignedProgress,
    quests: assignedProgress,
    completion: {
      label: 'Completion',
      value: completion,
      detail: 'assigned quests',
    },
    hero: isKid ? currentUserSnapshot : leaderSnapshot,
    leader: leaderSnapshot,
    achievement: {
      label: 'Achievements',
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

function pluralizeBadge(count) {
  return count === 1 ? 'badge' : 'badges'
}

export function summarizeTodayBadges(achievements = []) {
  const items = (Array.isArray(achievements) ? achievements : []).map((achievement) => {
    const title = achievement?.title || achievement?.name || 'Badge'
    const description = achievement?.description || ''
    const points = achievement?.points_reward || 0
    const tooltip = description
      ? `${title}: ${description} +${points} XP`
      : `${title} +${points} XP`

    return {
      ...achievement,
      title,
      points,
      tooltip,
    }
  })
  const count = items.length
  const totalXp = items.reduce((sum, achievement) => sum + achievement.points, 0)

  return {
    count,
    totalXp,
    label: `${count} ${pluralizeBadge(count)} / +${totalXp} XP`,
    items,
  }
}
