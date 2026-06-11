import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import AvatarDisplay from '../components/AvatarDisplay';
import {
  Award,
  BarChart3,
  Crown,
  Flame,
  Loader2,
  Medal,
  Sparkles,
  Star,
  Swords,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  bestProgressDay,
  formatPercent,
  summarizeAchievements,
} from '../utils/progressDashboard';

const RANK_STYLES = [
  {
    icon: Crown,
    badge: 'bg-gold/15 border-gold/40 text-gold',
    border: '!border-gold/40',
  },
  {
    icon: Medal,
    badge: 'bg-slate-300/10 border-slate-300/30 text-slate-200',
    border: '!border-slate-300/30',
  },
  {
    icon: Medal,
    badge: 'bg-amber-700/15 border-amber-600/30 text-amber-400',
    border: '!border-amber-600/30',
  },
];

function scoreFor(entry) {
  return entry.weekly_xp || entry.xp || 0;
}

function displayName(entry) {
  return entry.display_name || entry.username || 'Unknown';
}

function shortDate(dateStr) {
  if (!dateStr) return '';
  const [, month, day] = dateStr.split('-');
  return `${month}/${day}`;
}

function StatPanel({ icon: Icon, label, value, detail, tone = 'text-accent' }) {
  return (
    <div className="game-panel p-4 min-w-0">
      <div className="flex items-center gap-2 text-muted text-xs font-medium">
        <Icon size={14} className={tone} />
        <span>{label}</span>
      </div>
      <p className="text-cream text-2xl font-semibold mt-2 truncate">{value}</p>
      {detail && (
        <p className="text-muted text-xs mt-1 truncate">{detail}</p>
      )}
    </div>
  );
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

function TopRankCard({ entry, index, isCurrentUser }) {
  const style = RANK_STYLES[index] || RANK_STYLES[2];
  const Icon = style.icon;
  const xp = scoreFor(entry);
  const questsDone = entry.quests_completed || 0;
  const streak = entry.current_streak || 0;

  return (
    <div className={`game-panel p-4 min-w-0 ${style.border} ${isCurrentUser ? '!border-accent' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${style.badge}`}>
          <Icon size={13} />
          #{index + 1}
        </span>
        {isCurrentUser && (
          <span className="text-accent text-[10px] font-semibold uppercase">You</span>
        )}
      </div>

      <div className="flex flex-col items-center text-center mt-4">
        <AvatarDisplay
          config={entry.avatar_config}
          size="md"
          name={displayName(entry)}
          animate
        />
        <p className="text-cream text-sm font-semibold mt-3 truncate w-full">
          {displayName(entry)}
        </p>
        <p className="text-gold text-xl font-semibold mt-1">{xp} XP</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
        <div className="rounded-md border border-border bg-surface-raised/30 px-2 py-1.5">
          <span className="flex items-center justify-center gap-1 text-muted">
            <Swords size={11} className="text-accent" />
            {questsDone}
          </span>
        </div>
        <div className="rounded-md border border-border bg-surface-raised/30 px-2 py-1.5">
          <span className="flex items-center justify-center gap-1 text-muted">
            <Flame size={11} className="text-orange-400" />
            {streak}d
          </span>
        </div>
      </div>
    </div>
  );
}

function StandingRow({ entry, index, topScore, isCurrentUser }) {
  const xp = scoreFor(entry);
  const pct = topScore > 0 ? (xp / topScore) * 100 : 0;
  const questsDone = entry.quests_completed || 0;
  const streak = entry.current_streak || 0;

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
        name={displayName(entry)}
        animate
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-cream text-sm font-medium truncate">
            {displayName(entry)}
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

export default function Leaderboard() {
  const { user } = useAuth();
  const { leaderboard_enabled } = useSettings();
  const [entries, setEntries] = useState([]);
  const [progress, setProgress] = useState({ days: [], summary: {} });
  const [achievements, setAchievements] = useState([]);
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
  const topScore = entries.length > 0
    ? Math.max(...entries.map((entry) => scoreFor(entry)), 1)
    : 1;
  const topEntries = entries.slice(0, 3);

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
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatPanel
              icon={TrendingUp}
              label="30-Day XP"
              value={summary.total_xp || 0}
              detail={`${summary.avg_daily_xp || 0} per day`}
              tone="text-gold"
            />
            <StatPanel
              icon={Swords}
              label="Quests Done"
              value={summary.total_completed || 0}
              detail={`${summary.total_assigned || 0} assigned`}
              tone="text-emerald"
            />
            <StatPanel
              icon={BarChart3}
              label="Completion"
              value={formatPercent(summary.completion_rate)}
              detail="required quests"
              tone="text-accent"
            />
            <StatPanel
              icon={Star}
              label="Best Day"
              value={bestDay ? `${bestDay.xp || 0} XP` : '0 XP'}
              detail={bestDay ? shortDate(bestDay.date) : 'No XP yet'}
              tone="text-gold"
            />
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] gap-4">
            <div className="game-panel p-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-cream text-sm font-semibold flex items-center gap-2">
                  <TrendingUp size={16} className="text-gold" />
                  XP Trend
                </h2>
                {progressDays.length > 0 && (
                  <span className="text-muted text-xs">
                    {shortDate(progressDays[0]?.date)} to {shortDate(progressDays[progressDays.length - 1]?.date)}
                  </span>
                )}
              </div>
              <DailyBarChart days={progressDays} dataKey="xp" color="#f59e0b" suffix=" XP" />
            </div>

            <div className="game-panel p-4">
              <h2 className="text-cream text-sm font-semibold flex items-center gap-2 mb-4">
                <BarChart3 size={16} className="text-emerald" />
                Completion
              </h2>
              <DailyBarChart days={progressDays} dataKey="completed" color="#10b981" suffix=" completed" />
              <div className="flex items-center justify-between text-xs text-muted mt-2">
                <span>{summary.total_completed || 0} done</span>
                <span>{formatPercent(summary.completion_rate)} overall</span>
              </div>
            </div>
          </div>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={17} className="text-gold" />
              <h2 className="text-cream text-sm font-semibold">Hall of Fame</h2>
            </div>

            {entries.length === 0 ? (
              <div className="game-panel p-8 text-center">
                <p className="text-muted text-sm">No XP earned this week yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  {topEntries.map((entry, index) => {
                    const isCurrentUser = entry.user_id === user?.id || entry.id === user?.id;
                    return (
                      <TopRankCard
                        key={entry.user_id || entry.id || index}
                        entry={entry}
                        index={index}
                        isCurrentUser={isCurrentUser}
                      />
                    );
                  })}
                </div>

                <div className="game-panel p-3">
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
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Award size={17} className="text-accent" />
              <h2 className="text-cream text-sm font-semibold">Achievement Rewards</h2>
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <div className="game-panel p-4">
                <div className="flex items-center gap-2 text-muted text-xs font-medium">
                  <Sparkles size={14} className="text-gold" />
                  Rewards
                </div>
                <p className="text-cream text-2xl font-semibold mt-2">
                  {achievementSummary.unlockedCount}/{achievementSummary.total}
                </p>
                <p className="text-muted text-xs mt-1">
                  {achievementSummary.unlockedXp}/{achievementSummary.availableXp} XP unlocked
                </p>
              </div>

              <div className="game-panel p-4 lg:col-span-1">
                <h3 className="text-cream text-xs font-semibold mb-1">Recently Unlocked</h3>
                {achievementSummary.recentUnlocked.length > 0 ? (
                  achievementSummary.recentUnlocked.map((achievement) => (
                    <AchievementRow key={achievement.id || achievement.key} achievement={achievement} />
                  ))
                ) : (
                  <p className="text-muted text-sm py-5">No achievements unlocked yet.</p>
                )}
              </div>

              <div className="game-panel p-4 lg:col-span-1">
                <h3 className="text-cream text-xs font-semibold mb-1">Next Up</h3>
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
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
