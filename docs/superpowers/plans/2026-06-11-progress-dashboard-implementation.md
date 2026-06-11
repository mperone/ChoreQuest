# Progress Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Progress page into a compact snapshot-rail dashboard with tabbed Standings, Trends, and Achievements detail views.

**Architecture:** Keep the existing `Leaderboard.jsx` route and backend API calls. Move derived snapshot values into tested helpers in `progressDashboard.js`, then reshape the page into a responsive two-zone layout: a desktop/tablet rail that collapses into a mobile summary strip, and one tabbed detail pane.

**Tech Stack:** React 18, Vite, Tailwind CSS 4 utility classes, Lucide React icons, Node built-in test runner.

---

## File Structure

- Modify `frontend/src/utils/progressDashboard.js`: add leaderboard scoring/name helpers and a snapshot derivation helper.
- Modify `frontend/src/utils/progressDashboard.test.js`: add failing tests for the new helper behavior before implementation.
- Modify `frontend/src/pages/Leaderboard.jsx`: replace the long stacked report layout with the approved snapshot rail plus tabbed detail pane.
- Leave backend files and generated `static/` assets unchanged.

## Task 1: Add Tested Snapshot Derivation Helpers

**Files:**
- Modify: `frontend/src/utils/progressDashboard.test.js`
- Modify: `frontend/src/utils/progressDashboard.js`

- [ ] **Step 1: Write failing tests for progress snapshot derivation**

In `frontend/src/utils/progressDashboard.test.js`, update the import block to include the new helper exports:

```js
import {
  bestProgressDay,
  buildProgressSnapshot,
  displayNameForEntry,
  formatPercent,
  scoreForEntry,
  summarizeAchievements,
} from './progressDashboard.js'
```

Append these tests after the existing `formats completion rates consistently` test:

```js
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
```

- [ ] **Step 2: Run the helper tests and verify they fail for the expected reason**

Run:

```bash
node --test frontend/src/utils/progressDashboard.test.js
```

Expected: FAIL with an ESM import error such as `does not provide an export named 'buildProgressSnapshot'`.

- [ ] **Step 3: Add the helper implementation**

In `frontend/src/utils/progressDashboard.js`, insert these exported helpers after `bestProgressDay` and before `summarizeAchievements`:

```js
export function scoreForEntry(entry = {}) {
  return entry?.weekly_xp || entry?.xp || 0
}

export function displayNameForEntry(entry = {}) {
  return entry?.display_name || entry?.username || 'Unknown'
}

function shortDate(dateStr) {
  if (!dateStr) return ''
  const [, month, day] = dateStr.split('-')
  return `${month}/${day}`
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
```

- [ ] **Step 4: Run the helper tests and verify they pass**

Run:

```bash
node --test frontend/src/utils/progressDashboard.test.js
```

Expected: PASS with all `progressDashboard` tests green.

- [ ] **Step 5: Commit the helper change**

Run:

```bash
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add frontend/src/utils/progressDashboard.js frontend/src/utils/progressDashboard.test.js
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Add progress snapshot helpers"
```

## Task 2: Refactor Progress Page Components Around Dashboard Sections

**Files:**
- Modify: `frontend/src/pages/Leaderboard.jsx`

- [ ] **Step 1: Update imports and remove local duplicated helpers**

In `frontend/src/pages/Leaderboard.jsx`, change the Lucide import to remove unused rank-podium icons after the redesign:

```js
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
```

Change the progress helper import to:

```js
import {
  bestProgressDay,
  buildProgressSnapshot,
  displayNameForEntry,
  formatPercent,
  scoreForEntry,
  summarizeAchievements,
} from '../utils/progressDashboard';
```

Delete the local `RANK_STYLES` constant, `scoreFor`, `displayName`, `StatPanel`, and `TopRankCard`. Keep the local `shortDate`, `DailyBarChart`, `StandingRow`, and `AchievementRow` functions.

- [ ] **Step 2: Update leaderboard rows to use imported helper functions**

Replace the body of `StandingRow` with this version:

```jsx
function StandingRow({ entry, index, topScore, isCurrentUser }) {
  const xp = scoreForEntry(entry);
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
        name={displayNameForEntry(entry)}
        animate
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-cream text-sm font-medium truncate">
            {displayNameForEntry(entry)}
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
```

- [ ] **Step 3: Add tab and dashboard components above `export default function Leaderboard()`**

Insert this component block after `AchievementRow`:

```jsx
const PROGRESS_TABS = [
  { id: 'standings', label: 'Standings', icon: Trophy },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'achievements', label: 'Rewards', icon: Award },
];

function SnapshotMetric({ icon: Icon, label, value, detail, tone = 'text-accent' }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-raised/25 p-3">
      <div className="flex items-center gap-2 text-muted text-[11px] font-medium">
        <Icon size={13} className={tone} />
        <span className="truncate">{label}</span>
      </div>
      <p className="text-cream text-xl font-semibold mt-1 truncate">{value}</p>
      <p className="text-muted text-[11px] mt-0.5 truncate">{detail}</p>
    </div>
  );
}

function WeeklyLeader({ leader }) {
  return (
    <div className="rounded-md border border-gold/30 bg-gold/10 p-3">
      <div className="flex items-center gap-2 text-gold text-[11px] font-semibold">
        <Trophy size={13} />
        <span>Weekly Leader</span>
      </div>
      <div className="flex items-center gap-3 mt-3 min-w-0">
        <AvatarDisplay
          config={leader.avatarConfig}
          size="sm"
          name={leader.name}
          animate
        />
        <div className="min-w-0">
          <p className="text-cream text-sm font-semibold truncate">{leader.name}</p>
          <p className="text-gold text-xs font-semibold">{leader.detail}</p>
        </div>
      </div>
    </div>
  );
}

function SnapshotRail({ snapshot }) {
  return (
    <aside className="game-panel p-4 h-fit lg:sticky lg:top-20">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-cream text-sm font-semibold">Family Snapshot</h2>
        <span className="text-muted text-[11px]">30 days</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-3">
        <WeeklyLeader leader={snapshot.leader} />
        <SnapshotMetric
          icon={Swords}
          label={snapshot.quests.label}
          value={snapshot.quests.value}
          detail={snapshot.quests.detail}
          tone="text-emerald"
        />
        <SnapshotMetric
          icon={BarChart3}
          label={snapshot.completion.label}
          value={snapshot.completion.value}
          detail={snapshot.completion.detail}
          tone="text-accent"
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
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors min-w-0 ${
        active
          ? 'bg-accent text-navy'
          : 'text-muted hover:text-cream hover:bg-surface-raised'
      }`}
    >
      <Icon size={15} />
      <span className="truncate">{tab.label}</span>
    </button>
  );
}

function StandingsPanel({ entries, user, topScore }) {
  if (entries.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted text-sm">No XP earned this week yet.</p>
      </div>
    );
  }

  return (
    <div>
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

function TrendsPanel({ progressDays, summary, bestDay }) {
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-3 gap-3">
        <SnapshotMetric
          icon={TrendingUp}
          label="30-Day XP"
          value={summary.total_xp || 0}
          detail={`${summary.avg_daily_xp || 0} per day`}
          tone="text-gold"
        />
        <SnapshotMetric
          icon={Star}
          label="Best Day"
          value={bestDay ? `${bestDay.xp || 0} XP` : '0 XP'}
          detail={bestDay ? shortDate(bestDay.date) : 'No XP yet'}
          tone="text-gold"
        />
        <SnapshotMetric
          icon={BarChart3}
          label="Completion"
          value={formatPercent(summary.completion_rate)}
          detail={`${summary.total_completed || 0}/${summary.total_assigned || 0} quests`}
          tone="text-accent"
        />
      </div>

      <div>
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
      </div>

      <div className="border-t border-border/60 pt-4">
        <h3 className="text-cream text-sm font-semibold flex items-center gap-2 mb-3">
          <BarChart3 size={16} className="text-emerald" />
          Completion
        </h3>
        <DailyBarChart days={progressDays} dataKey="completed" color="#10b981" suffix=" completed" />
        <div className="flex items-center justify-between text-xs text-muted mt-2">
          <span>{summary.total_completed || 0} done</span>
          <span>{formatPercent(summary.completion_rate)} overall</span>
        </div>
      </div>
    </div>
  );
}

function AchievementsPanel({ achievementSummary }) {
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-3">
        <SnapshotMetric
          icon={Sparkles}
          label="Rewards"
          value={`${achievementSummary.unlockedCount}/${achievementSummary.total}`}
          detail={`${achievementSummary.unlockedXp}/${achievementSummary.availableXp} XP unlocked`}
          tone="text-gold"
        />
        <SnapshotMetric
          icon={Award}
          label="Next Up"
          value={achievementSummary.nextLocked[0]?.title || achievementSummary.nextLocked[0]?.name || 'Complete'}
          detail={achievementSummary.nextLocked.length > 0 ? 'Next reward to chase' : 'All achievements unlocked'}
          tone="text-accent"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <h3 className="text-cream text-xs font-semibold mb-1">Recently Unlocked</h3>
          {achievementSummary.recentUnlocked.length > 0 ? (
            achievementSummary.recentUnlocked.map((achievement) => (
              <AchievementRow key={achievement.id || achievement.key} achievement={achievement} />
            ))
          ) : (
            <p className="text-muted text-sm py-5">No achievements unlocked yet.</p>
          )}
        </div>

        <div>
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
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] items-start">
      <SnapshotRail snapshot={snapshot} />

      <section className="game-panel min-w-0 overflow-hidden">
        <div
          role="tablist"
          aria-label="Progress sections"
          className="grid grid-cols-3 gap-1 border-b border-border p-2"
        >
          {PROGRESS_TABS.map((tab) => (
            <ProgressTabButton
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
            />
          ))}
        </div>

        <div className="p-4" role="tabpanel">
          {activeTab === 'standings' && (
            <StandingsPanel entries={entries} user={user} topScore={topScore} />
          )}
          {activeTab === 'trends' && (
            <TrendsPanel
              progressDays={progressDays}
              summary={summary}
              bestDay={bestDay}
            />
          )}
          {activeTab === 'achievements' && (
            <AchievementsPanel achievementSummary={achievementSummary} />
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run the helper test after component refactor**

Run:

```bash
node --test frontend/src/utils/progressDashboard.test.js
```

Expected: PASS. This confirms the imported helpers still match the tests before the main render is swapped.

## Task 3: Wire the New Dashboard Layout Into the Page

**Files:**
- Modify: `frontend/src/pages/Leaderboard.jsx`

- [ ] **Step 1: Add active tab state**

Inside `Leaderboard`, after the existing `error` state, add:

```jsx
const [activeTab, setActiveTab] = useState('standings');
```

- [ ] **Step 2: Replace derived values with snapshot-aware values**

Replace the existing derived-value block:

```jsx
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
```

with:

```jsx
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
```

- [ ] **Step 3: Replace the loaded content stack with the compact dashboard**

Replace the loaded-content conditional that starts with `{leaderboard_enabled && !loading && !error && (` and currently renders the stat panels, XP chart, completion chart, Hall of Fame section, and Achievement Rewards section with this compact dashboard call:

```jsx
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
```

- [ ] **Step 4: Run the frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS with Vite producing a production build. Do not copy `frontend/dist` into `static/`.

- [ ] **Step 5: Commit the dashboard layout**

Run:

```bash
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add frontend/src/pages/Leaderboard.jsx
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Redesign progress page dashboard"
```

## Task 4: Final Verification and Visual Check

**Files:**
- Verify: `frontend/src/utils/progressDashboard.test.js`
- Verify: `frontend/vite.config.test.js`
- Verify: `frontend/src/pages/Leaderboard.jsx`

- [ ] **Step 1: Run focused frontend tests**

Run:

```bash
node --test frontend/src/utils/progressDashboard.test.js
node --test frontend/vite.config.test.js
```

Expected: PASS for both commands.

- [ ] **Step 2: Run production build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS. If `node_modules` is missing, run `npm --prefix frontend install` only after user approval because it may require network access.

- [ ] **Step 3: Start the frontend dev server for review**

Run:

```bash
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173
```

Expected: Vite serves the frontend at `http://127.0.0.1:5173/`.

- [ ] **Step 4: Inspect the Progress page in a browser**

Open:

```text
http://127.0.0.1:5173/leaderboard
```

Check these visible states:

- The desktop/tablet layout shows a left Family Snapshot rail and one right detail pane.
- The mobile-width layout shows the snapshot as a compact top strip above the tabs.
- The `Standings`, `Trends`, and `Rewards` tabs switch content without navigating away.
- The active tab is clear by text/background treatment and has `aria-selected="true"`.
- Empty states remain compact inside the active tab or snapshot area.

- [ ] **Step 5: Commit verification notes only if implementation required follow-up edits**

If visual verification reveals a layout defect and a follow-up code edit is made, stage and commit only touched implementation files:

```bash
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add frontend/src/pages/Leaderboard.jsx frontend/src/utils/progressDashboard.js frontend/src/utils/progressDashboard.test.js
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Polish progress dashboard responsiveness"
```
