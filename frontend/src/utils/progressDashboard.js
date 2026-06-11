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
