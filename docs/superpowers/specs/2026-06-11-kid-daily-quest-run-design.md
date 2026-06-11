# Kid Daily Quest Run Design

## Goal

Make the kid home screen the primary place where kids do today's quests. The experience should answer "what should I do now?", support direct completion from the home screen, and remove the pet system so the app feels cleaner and more focused.

## Product Decisions

- Kid Home becomes the daily action surface.
- Quests becomes a browse, schedule, and history surface.
- Quest timing lives on the quest itself, not per assignment.
- Quest ordering is manual inside each daypart.
- Required `Anytime` quests appear after the current daypart's required quests.
- Optional quests stay separate as `Bonus`.
- Parent ordering uses drag from the first version.
- Pets are removed from active product behavior and UI.

## Dayparts And Ordering

Add quest-level fields:

- `daypart`: one of `morning`, `afternoon`, `evening`, or `anytime`.
- `sort_order`: an internal integer used to preserve manual order within a daypart.

Parents should never type a sort number. Parent-facing controls are:

- A daypart segmented control or select in quest create/edit.
- A drag-reorder Quest Management view grouped by daypart.
- Drag handles on each quest row.
- Immediate visual feedback while dragging.

Default behavior:

- Existing quests migrate to `anytime`.
- Existing quests receive stable `sort_order` values based on current ID or created order.
- New quests default to `anytime` and append to the end of that daypart unless the parent changes it.

## Kid Home

Kid Home should use today's assignments and group them into:

- `Now`: required quests for the current daypart, ordered by `sort_order`.
- `Anytime`: required anytime quests, shown after `Now`.
- `Later`: required quests for later dayparts.
- `Bonus`: optional quests, kept out of the required completion path.
- `Done Today`: compact completion state once all required quests are submitted or approved.

The current daypart can be computed from local app time using the family rollover timezone. The first version should use simple windows:

- Morning: 5:00 AM to 11:59 AM.
- Afternoon: 12:00 PM to 4:59 PM.
- Evening: 5:00 PM to 4:59 AM.

This is intentionally broad. We are not adding exact due times, reminders, or overdue warnings in this version.

## Direct Completion

Actionable quests on Kid Home can be completed in place.

- Non-photo quests show a primary `Complete Quest` button.
- Photo-required quests show an inline photo picker and then `Submit Quest`.
- Submitted quests move out of the action queue and into a compact awaiting-approval or completed row.
- The page refreshes local assignment state after submission.
- The existing completion endpoint remains the source of truth.

Completion feedback should be short and useful:

- Show a success state on the completed row.
- Update progress immediately after the API response.
- If all required quests are done, show the daily done state and point toward the spin wheel when enabled.

## Quests Screen

The Quests screen remains useful, but it stops being the main daily execution surface.

Kid Quests should become:

- Today, Upcoming, and Recent browsing.
- Filters by category and difficulty.
- Schedule/status context.
- History for submitted, approved, skipped, and missed quests.
- A path to quest details.

Kid Quests list cards should not include inline completion controls once Kid Home supports the full completion flow. Chore Detail can keep a secondary completion fallback for direct links, but Home is the primary daily action surface.

## Parent Quest Management

Parent Quest Management should gain a grouped ordering mode:

- Group quests by Morning, Afternoon, Evening, and Anytime.
- Each group contains draggable rows.
- Rows show title, category, points, difficulty, optional/photo flags, and assignment status.
- Dragging within a group changes `sort_order`.
- Dragging between groups changes both `daypart` and `sort_order`.
- Reordering saves optimistically with a visible saving state and rollback on API failure.

Quest create/edit should include daypart selection. Reordering is handled in the grouped management view rather than inside the modal.

## Pet Removal

Remove pet product behavior from the active app:

- Remove the Pet Care panel from Kid Home.
- Remove pet interaction calls and daily interaction counts.
- Remove pet XP awards from chore approval, bonus points, spin results, and achievements.
- Remove pet level display from Kid Home and avatar/profile surfaces.
- Remove pet selection and pet accessories from avatar editing and avatar display code.
- Remove pet achievements and achievement criteria tied to pet level or pet XP.
- Delete the `/api/pets/interact` backend route and stop registering the pets router.

The first implementation should not destructively delete production user JSON data unless we explicitly add a cleanup migration. It is enough for existing pet fields in `avatar_config` to become inert.

## Data Flow

Backend:

- Add a `QuestDaypart` enum.
- Add `daypart` and `sort_order` to the `chores` table.
- Include these fields in chore, calendar, and kid assignment responses.
- Add a parent-only reorder endpoint that accepts ordered chore IDs grouped by daypart.
- Keep assignment generation date-based. Daypart affects display and ordering, not whether an assignment exists.

Frontend:

- Add tested helper logic for grouping today's kid assignments by daypart and status.
- Kid Home consumes today's assignments and renders the daily run groups.
- Quest Management consumes chore metadata and exposes drag ordering.
- Quests consumes the same metadata for browsing and labels.

## Error Handling

- If daypart is missing or invalid, treat the quest as `anytime`.
- If sort order is missing, sort after ordered items by title or ID.
- If completion fails, keep the quest in place and show a compact error.
- If reorder saving fails, restore the previous order and show an error banner.
- If photo upload is required and no file is selected, keep the submit button disabled.

## Testing

Backend tests:

- Migration/defaults add daypart and sort order safely.
- Reorder endpoint updates daypart and order for parent users.
- Reorder endpoint rejects kid users.
- Calendar and chore responses include daypart/order.

Frontend tests:

- Kid assignment grouping puts current daypart required quests first, then required anytime, then later, then bonus.
- Grouping falls back safely for missing daypart/order.
- Completion controls require photo when needed.
- Parent reorder helper produces a stable payload after drag between dayparts.

Verification:

- Run backend unit tests around migrations, chores, and calendar.
- Run focused frontend helper tests.
- Run the Vite config test.
- Run the frontend production build.
- Manually inspect Kid Home and parent Quest Management on mobile and desktop widths.

## Static Mockup

The companion static mockup lives at `docs/mockups/kid-daily-quest-run.html`. It shows:

- A focused kid home layout.
- A grouped kid home layout.
- Parent drag ordering grouped by daypart.
