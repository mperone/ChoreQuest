# Progress Dashboard Redesign Spec

## Goal

Replace the current long, repetitive Progress page with a compact dashboard that shows the family snapshot first and keeps deeper content organized in tabs.

## Approved Direction

Use a Snapshot Rail + Detail Pane layout.

- Desktop and tablet: a left snapshot rail shows key current-state metrics, while a right pane switches between tabbed detail views.
- Mobile: the snapshot rail collapses into a compact top summary strip above the tabs.
- The page should feel like one control surface, not a sequence of stacked report sections.

## User Experience

The first view should answer: "What is happening right now?"

The snapshot area should include:

- Today's or current-window quest completion summary using the existing progress summary data.
- Weekly leader or top performer using existing leaderboard data.
- Overall completion rate.
- Achievement progress or recently unlocked reward signal.

The detail pane should use tabs:

- Standings: compact leaderboard rows, with the current user highlighted.
- Trends: XP and completion charts for the existing progress window.
- Achievements: unlocked count, recent unlocks, and next locked achievements.

The page should avoid repeating the same metrics in multiple sections. A metric should live either in the snapshot area or in the selected detail tab, unless a small contextual repeat makes the tab easier to scan.

## Layout Rules

- Keep the initial desktop viewport useful without requiring a long scroll.
- Avoid nested cards. Use panels for the rail, detail pane, and repeated rows only.
- Keep visual density high enough for repeated family use, but preserve readable spacing.
- Use existing ChoreQuest colors, `game-panel`, `xp-bar`, avatar components, and Lucide icons.
- Preserve the current disabled, loading, and error states.
- Do not edit generated `static/` assets as part of implementation.

## Data Flow

No backend changes are required.

The redesigned page continues to fetch:

- `/api/stats/leaderboard` for rankings and weekly XP.
- `/api/progress` for the 30-day progress summary and daily data.
- `/api/stats/achievements/all` for achievement summary, recent unlocks, and next rewards.

The current `ws:message` refresh behavior should remain intact.

## Component Shape

The implementation should keep the existing route in `frontend/src/pages/Leaderboard.jsx`, but split repeated display logic into small local components where useful:

- Snapshot metric components for the rail/top strip.
- Tab controls for Standings, Trends, and Achievements.
- Detail pane components for leaderboard rows, charts, and achievement rows.

Existing helper functions in `frontend/src/utils/progressDashboard.js` should be extended for derived display data when that makes tests clearer.

## Accessibility

- Tabs should use buttons with `aria-selected` and clear labels.
- The selected tab should be visually obvious without relying only on color.
- Chart SVGs should retain accessible labels and titles.
- Text should truncate only where the full value is not essential, such as long names in leaderboard rows.

## Error Handling

- If progress is disabled, keep the existing disabled message.
- If any fetch fails, keep a single visible error message.
- If the leaderboard, progress, or achievements arrays are empty, show compact empty states inside the relevant snapshot or tab area.

## Testing

Add frontend tests before implementation for any new or changed helper logic in `frontend/src/utils/progressDashboard.js`.

Expected coverage:

- Snapshot summary derivation chooses the weekly leader from leaderboard entries.
- Achievement summary still reports unlocked and next-up rewards correctly.
- Empty data produces safe fallback values for the snapshot area.

Verification after implementation:

- Run `node --test frontend/src/utils/progressDashboard.test.js`.
- Run `node --test frontend/vite.config.test.js`.
- Run `npm --prefix frontend run build` if Node dependencies are available.
