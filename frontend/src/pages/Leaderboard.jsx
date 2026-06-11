import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import AvatarDisplay from '../components/AvatarDisplay';
import {
  Award,
  BarChart3,
  Flame,
  Loader2,
  Sparkles,
  Star,
  Swords,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  bestProgressDay,
  buildProgressSnapshot,
  displayNameForEntry,
  formatPercent,
  scoreForEntry,
  summarizeAchievements,
} from '../utils/progressDashboard';

function shortDate(dateStr) {
  if (!dateStr) return '';
  const [, month, day] = dateStr.split('-');
  return `${month}/${day}`;
}

function DailyBarChart({ days, dataKey, color, suffix = '' }) {
  if (!days || days.length === 0) {
    return (
      <p className="text-muted text-sm text-center py-12">
        No progress data yet.
      </p>
    );
  }

  const max = Math.max(...days.map((day) => day[dataKey] || 0), 1);
  const barWidth = 100 / days.length;
  const height = 84;
  const padding = 4;

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      className="w-full h-32"
      preserveAspectRatio="none"
      role="img"
      aria-label="Daily progress chart"
    >
      {days.map((day, index) => {
        const value = day[dataKey] || 0;
        const barHeight = Math.max((value / max) * (height - padding * 2), value > 0 ? 2 : 0.75);
        const x = index * barWidth + barWidth * 0.18;
        const y = height - padding - barHeight;

        return (
          <rect
            key={day.date || index}
            x={x}
            y={y}
            width={barWidth * 0.64}
            height={barHeight}
            rx="1.1"
            fill={color}
            opacity={index === days.length - 1 ? 1 : 0.68}
          >
            <title>{`${shortDate(day.date)}: ${value}${suffix}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function StandingRow({ entry, index, topScore, isCurrentUser }) {
  const xp = scoreForEntry(entry);
  const pct = topScore > 0 ? (xp / topScore) * 100 : 0;
  const questsDone = entry.quests_completed || 0;
  const streak = entry.current_streak || 0;
  const displayName = displayNameForEntry(entry);

  return (
    <div
      className={`flex items-center gap-3 py-3 border-b border-border/50 last:border-b-0 ${
        isCurrentUser ? 'bg-accent/5 -mx-3 px-3 rounded-md border-b-0 mb-1' : ''
      }`}
    >
      <div className="w-8 text-center text-muted text-sm font-semibold">
        #{index + 1}
      </div>
      <AvatarDisplay
        config={entry.avatar_config}
        size="sm"
        name={displayName}
        animate
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-cream text-sm font-medium truncate">
            {displayName}
          </p>
          <span className="text-gold text-sm font-semibold whitespace-nowrap">{xp} XP</span>
        </div>
        <div className="xp-bar mt-2 !h-3">
          <div className="xp-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted mt-1.5">
          <span className="flex items-center gap-1">
            <Swords size={11} className="text-accent" />
            {questsDone} quest{questsDone !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Flame size={11} className="text-orange-400" />
            {streak}d streak
          </span>
          {entry.total_xp != null && (
            <span className="hidden sm:inline">{entry.total_xp} total XP</span>
          )}
        </div>
      </div>
    </div>
  );
}

function AchievementRow({ achievement, muted = false }) {
  return (
    <div className={`flex items-start gap-3 py-3 border-b border-border/50 last:border-b-0 ${muted ? 'opacity-75' : ''}`}>
      <div className="w-8 h-8 rounded-md border border-border bg-surface-raised/40 flex items-center justify-center flex-shrink-0">
        {achievement.unlocked ? (
          <Star size={14} className="text-gold" />
        ) : (
          <Award size={14} className="text-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-cream text-sm font-medium truncate">
            {achievement.title || achievement.name}
          </p>
          <span className="text-gold text-xs font-semibold whitespace-nowrap">
            +{achievement.points_reward || 0}
          </span>
        </div>
        {achievement.description && (
          <p className="text-muted text-xs mt-0.5 line-clamp-2">
            {achievement.description}
          </p>
        )}
      </div>
    </div>
  );
}

const PROGRESS_TABS = [
  { id: 'standings', label: 'Standings', icon: Trophy },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'achievements', label: 'Rewards', icon: Sparkles },
];

function SnapshotMetric({ icon: Icon, label, value, detail, tone = 'text-accent' }) {
  return (
    <div className="rounded-md border border-border bg-surface-raised/30 p-3 min-w-0">
      <div className="flex items-center gap-2 text-muted text-[11px] font-semibold uppercase tracking-wide">
        <Icon size={13} className={tone} />
        <span className="truncate">{label}</span>
      </div>
      <p className={`text-lg font-semibold mt-1 truncate ${tone}`}>{value}</p>
      {detail && (
        <p className="text-muted text-xs mt-0.5 truncate">{detail}</p>
      )}
    </div>
  );
}

function WeeklyLeader({ snapshot }) {
  const leader = snapshot.leader;

  return (
    <div className="rounded-md border border-border bg-surface-raised/30 p-3 min-w-0">
      <div className="flex items-center gap-2 text-muted text-[11px] font-semibold uppercase tracking-wide">
        <Trophy size={13} className="text-gold" />
        <span>Weekly Leader</span>
      </div>
      <div className="flex items-center gap-3 mt-3 min-w-0">
        <AvatarDisplay
          config={leader.avatarConfig}
          size="sm"
          name={leader.name}
          animate={leader.score > 0}
        />
        <div className="min-w-0">
          <p className="text-cream text-sm font-semibold truncate">
            {leader.name}
          </p>
          <p className="text-muted text-xs truncate">
            {leader.detail}
          </p>
        </div>
      </div>
    </div>
  );
}

function SnapshotRail({ snapshot }) {
  return (
    <aside className="game-panel p-4 lg:sticky lg:top-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-cream text-sm font-semibold">Family Snapshot</h2>
        <span className="rounded-md border border-border bg-surface-raised/30 px-2 py-1 text-[11px] font-semibold text-muted">
          30 days
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-1 gap-3">
        <WeeklyLeader snapshot={snapshot} />
        <SnapshotMetric
          icon={Swords}
          label={snapshot.quests.label}
          value={snapshot.quests.value}
          detail={snapshot.quests.detail}
          tone="text-accent"
        />
        <SnapshotMetric
          icon={BarChart3}
          label={snapshot.completion.label}
          value={snapshot.completion.value}
          detail={snapshot.completion.detail}
          tone="text-emerald"
        />
        <SnapshotMetric
          icon={Sparkles}
          label={snapshot.achievement.label}
          value={snapshot.achievement.value}
          detail={snapshot.achievement.detail}
          tone="text-gold"
        />
      </div>
    </aside>
  );
}

function ProgressTabButton({ tab, active, onClick }) {
  const Icon = tab.icon;

  return (
    <button
      type="button"
      role="tab"
      id={`progress-tab-${tab.id}`}
      aria-selected={active}
      aria-controls={`progress-panel-${tab.id}`}
      onClick={() => onClick(tab.id)}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
        active
          ? 'bg-accent text-navy'
          : 'text-muted hover:bg-surface-raised/50 hover:text-cream'
      }`}
    >
      <Icon size={15} />
      <span>{tab.label}</span>
    </button>
  );
}

function StandingsPanel({ entries, topScore, user }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface-raised/20 p-8 text-center">
        <p className="text-muted text-sm">No XP earned this week yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/70 bg-surface-raised/20 px-3">
      {entries.map((entry, index) => {
        const isCurrentUser = entry.user_id === user?.id || entry.id === user?.id;
        return (
          <StandingRow
            key={entry.user_id || entry.id || index}
            entry={entry}
            index={index}
            topScore={topScore}
            isCurrentUser={isCurrentUser}
          />
        );
      })}
    </div>
  );
}

function TrendsPanel({ bestDay, progressDays, snapshot, summary }) {
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <SnapshotMetric
          icon={TrendingUp}
          label={snapshot.xp.label}
          value={snapshot.xp.value}
          detail={snapshot.xp.detail}
          tone="text-gold"
        />
        <SnapshotMetric
          icon={Star}
          label={snapshot.bestDay.label}
          value={snapshot.bestDay.value}
          detail={snapshot.bestDay.detail}
          tone="text-accent"
        />
        <SnapshotMetric
          icon={BarChart3}
          label={snapshot.completion.label}
          value={snapshot.completion.value}
          detail={snapshot.completion.detail}
          tone="text-emerald"
        />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(240px,0.9fr)] gap-4">
        <section className="rounded-md border border-border/70 bg-surface-raised/20 p-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-cream text-sm font-semibold flex items-center gap-2">
              <TrendingUp size={16} className="text-gold" />
              XP Trend
            </h3>
            {progressDays.length > 0 && (
              <span className="text-muted text-xs">
                {shortDate(progressDays[0]?.date)} to {shortDate(progressDays[progressDays.length - 1]?.date)}
              </span>
            )}
          </div>
          <DailyBarChart days={progressDays} dataKey="xp" color="#f59e0b" suffix=" XP" />
        </section>

        <section className="rounded-md border border-border/70 bg-surface-raised/20 p-3">
          <h3 className="text-cream text-sm font-semibold flex items-center gap-2 mb-3">
            <BarChart3 size={16} className="text-emerald" />
            Completion
          </h3>
          <DailyBarChart days={progressDays} dataKey="completed" color="#10b981" suffix=" completed" />
          <div className="flex items-center justify-between text-xs text-muted mt-2">
            <span>{summary.total_completed || 0} done</span>
            <span>{formatPercent(summary.completion_rate)} overall</span>
          </div>
        </section>
      </div>

      {bestDay && (
        <p className="text-muted text-xs">
          Best day was {shortDate(bestDay.date)} with {bestDay.xp || 0} XP.
        </p>
      )}
    </div>
  );
}

function AchievementsPanel({ achievementSummary, snapshot }) {
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <SnapshotMetric
          icon={Sparkles}
          label={snapshot.achievement.label}
          value={snapshot.achievement.value}
          detail={snapshot.achievement.detail}
          tone="text-gold"
        />
        <SnapshotMetric
          icon={Award}
          label="Reward XP"
          value={`${achievementSummary.unlockedXp || 0}/${achievementSummary.availableXp || 0}`}
          detail="achievement XP unlocked"
          tone="text-accent"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-md border border-border/70 bg-surface-raised/20 p-3">
          <h3 className="text-cream text-sm font-semibold mb-1">Recently Unlocked</h3>
          {achievementSummary.recentUnlocked.length > 0 ? (
            achievementSummary.recentUnlocked.map((achievement) => (
              <AchievementRow key={achievement.id || achievement.key} achievement={achievement} />
            ))
          ) : (
            <p className="text-muted text-sm py-5">No achievements unlocked yet.</p>
          )}
        </section>

        <section className="rounded-md border border-border/70 bg-surface-raised/20 p-3">
          <h3 className="text-cream text-sm font-semibold mb-1">Next Up</h3>
          {achievementSummary.nextLocked.length > 0 ? (
            achievementSummary.nextLocked.map((achievement) => (
              <AchievementRow
                key={achievement.id || achievement.key}
                achievement={achievement}
                muted
              />
            ))
          ) : (
            <p className="text-muted text-sm py-5">All achievements unlocked.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ProgressDashboard({
  activeTab,
  achievementSummary,
  bestDay,
  entries,
  onTabChange,
  progressDays,
  snapshot,
  summary,
  topScore,
  user,
}) {
  const selectedTab = PROGRESS_TABS.some((tab) => tab.id === activeTab)
    ? activeTab
    : 'standings';

  return (
    <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)] items-start">
      <SnapshotRail snapshot={snapshot} />
      <section className="game-panel p-4 min-w-0">
        <div
          role="tablist"
          aria-label="Progress details"
          className="flex flex-wrap gap-2 border-b border-border/70 pb-3"
        >
          {PROGRESS_TABS.map((tab) => (
            <ProgressTabButton
              key={tab.id}
              tab={tab}
              active={selectedTab === tab.id}
              onClick={onTabChange}
            />
          ))}
        </div>

        <div
          role="tabpanel"
          id={`progress-panel-${selectedTab}`}
          aria-labelledby={`progress-tab-${selectedTab}`}
          className="mt-4"
        >
          {selectedTab === 'standings' && (
            <StandingsPanel entries={entries} topScore={topScore} user={user} />
          )}
          {selectedTab === 'trends' && (
            <TrendsPanel
              bestDay={bestDay}
              progressDays={progressDays}
              snapshot={snapshot}
              summary={summary}
            />
          )}
          {selectedTab === 'achievements' && (
            <AchievementsPanel
              achievementSummary={achievementSummary}
              snapshot={snapshot}
            />
          )}
        </div>
      </section>
    </div>
  );
}

export default function Leaderboard() {
  const { user } = useAuth();
  const { leaderboard_enabled } = useSettings();
  const [entries, setEntries] = useState([]);
  const [progress, setProgress] = useState({ days: [], summary: {} });
  const [achievements, setAchievements] = useState([]);
  const [activeTab, setActiveTab] = useState('standings');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchProgress = useCallback(async () => {
    try {
      setError('');
      const [leaderboardData, progressData, achievementsData] = await Promise.all([
        api('/api/stats/leaderboard'),
        api('/api/progress'),
        api('/api/stats/achievements/all').catch(() => []),
      ]);
      setEntries(leaderboardData.leaderboard || leaderboardData || []);
      setProgress(progressData || { days: [], summary: {} });
      setAchievements(achievementsData.achievements || achievementsData || []);
    } catch (err) {
      setError(err.message || 'Failed to load progress');
    }
  }, []);

  useEffect(() => {
    if (!leaderboard_enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchProgress().finally(() => setLoading(false));
  }, [fetchProgress, leaderboard_enabled]);

  useEffect(() => {
    if (!leaderboard_enabled) return undefined;
    const handler = () => { fetchProgress(); };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchProgress, leaderboard_enabled]);

  const progressDays = progress.days || [];
  const summary = progress.summary || {};
  const achievementSummary = useMemo(
    () => summarizeAchievements(achievements),
    [achievements],
  );
  const bestDay = useMemo(() => bestProgressDay(progressDays), [progressDays]);
  const snapshot = useMemo(
    () => buildProgressSnapshot({
      entries,
      summary,
      achievementSummary,
      bestDay,
    }),
    [entries, summary, achievementSummary, bestDay],
  );
  const topScore = entries.length > 0
    ? Math.max(...entries.map((entry) => scoreForEntry(entry)), 1)
    : 1;

  return (
    <div className="w-full max-w-5xl mx-auto overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-cream text-lg font-semibold">
            Progress
          </h1>
          <p className="text-muted text-sm mt-1">
            Weekly rankings, 30-day activity, and achievement rewards.
          </p>
        </div>
      </div>

      {!leaderboard_enabled && (
        <div className="game-panel p-8 text-center">
          <p className="text-cream text-sm font-medium">Progress Disabled</p>
          <p className="text-muted text-sm mt-1">
            The progress page has been turned off in family settings.
          </p>
        </div>
      )}

      {leaderboard_enabled && error && (
        <div className="mb-4 p-2.5 rounded-md border border-crimson/40 bg-crimson/10 text-crimson text-sm">
          {error}
        </div>
      )}

      {leaderboard_enabled && loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-accent animate-spin" />
        </div>
      )}

      {leaderboard_enabled && !loading && !error && (
        <ProgressDashboard
          activeTab={activeTab}
          achievementSummary={achievementSummary}
          bestDay={bestDay}
          entries={entries}
          onTabChange={setActiveTab}
          progressDays={progressDays}
          snapshot={snapshot}
          summary={summary}
          topScore={topScore}
          user={user}
        />
      )}
    </div>
  );
}
