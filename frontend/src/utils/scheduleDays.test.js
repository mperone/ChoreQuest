import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSchedulePreview,
  formatScheduleDays,
  formatScheduleSummary,
  normalizeScheduleDays,
  scheduleShowsPreview,
  weekdayFromISODate,
} from './scheduleDays.js'

test('normalizes selected schedule days into weekday order', () => {
  const clickedDays = [0, 2, 1]

  assert.deepEqual(normalizeScheduleDays(clickedDays), [0, 1, 2])
})

test('normalizes duplicate selected days without mutating the source array', () => {
  const clickedDays = [4, 2, 4, 1]

  assert.deepEqual(normalizeScheduleDays(clickedDays), [1, 2, 4])
  assert.deepEqual(clickedDays, [4, 2, 4, 1])
})

test('formats schedule days in weekday order', () => {
  assert.equal(formatScheduleDays([0, 2, 1]), 'Mon, Tue, Wed')
})

test('finds the weekday for an ISO date without timezone drift', () => {
  assert.equal(weekdayFromISODate('2026-06-10'), 2)
})

test('formats one-time and recurring schedule summaries', () => {
  assert.equal(
    formatScheduleSummary({ schedule_type: 'once', start_date: '2026-06-12' }),
    'One time on Jun 12',
  )
  assert.equal(
    formatScheduleSummary({ schedule_type: 'daily', start_date: '2026-06-12' }),
    'Every day starting Jun 12',
  )
  assert.equal(
    formatScheduleSummary({
      schedule_type: 'weekly',
      start_date: '2026-06-12',
      weekdays: [4, 0, 2],
    }),
    'Every week on Mon, Wed, Fri starting Jun 12',
  )
  assert.equal(
    formatScheduleSummary({
      schedule_type: 'fortnightly',
      start_date: '2026-06-12',
      weekdays: [5],
    }),
    'Every other week on Sat starting Jun 12',
  )
  assert.equal(
    formatScheduleSummary({
      schedule_type: 'monthly',
      start_date: '2026-06-12',
      month_day: 12,
    }),
    'Every month on the 12th starting Jun 12',
  )
  assert.equal(
    formatScheduleSummary({
      schedule_type: 'monthly',
      start_date: '2026-06-12',
      month_day: -1,
    }),
    'Every month on the last day starting Jun 12',
  )
})

test('formats legacy custom-day schedules as weekly schedules', () => {
  assert.equal(
    formatScheduleSummary({
      recurrence: 'custom',
      start_date: '2026-06-12',
      custom_days: [2, 0],
    }),
    'Every week on Mon, Wed starting Jun 12',
  )
})

test('previews one-time and daily schedules from the start date', () => {
  assert.deepEqual(
    buildSchedulePreview({
      schedule_type: 'once',
      start_date: '2026-06-10',
    }),
    ['2026-06-10'],
  )

  assert.deepEqual(
    buildSchedulePreview({
      schedule_type: 'daily',
      start_date: '2026-06-10',
    }, 4),
    ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13'],
  )
})

test('previews weekly schedules without including selected weekdays before the start date', () => {
  assert.deepEqual(
    buildSchedulePreview({
      schedule_type: 'weekly',
      start_date: '2026-06-10',
      weekdays: [0, 2, 4],
    }, 5),
    ['2026-06-10', '2026-06-12', '2026-06-15', '2026-06-17', '2026-06-19'],
  )
})

test('previews fortnightly schedules using alternating weeks anchored to the start week', () => {
  assert.deepEqual(
    buildSchedulePreview({
      schedule_type: 'fortnightly',
      start_date: '2026-06-10',
      weekdays: [0, 2],
    }, 5),
    ['2026-06-10', '2026-06-22', '2026-06-24', '2026-07-06', '2026-07-08'],
  )
})

test('previews monthly schedules including last day of month', () => {
  assert.deepEqual(
    buildSchedulePreview({
      schedule_type: 'monthly',
      start_date: '2026-01-10',
      month_day: 10,
    }, 3),
    ['2026-01-10', '2026-02-10', '2026-03-10'],
  )

  assert.deepEqual(
    buildSchedulePreview({
      schedule_type: 'monthly',
      start_date: '2026-01-10',
      month_day: -1,
    }, 3),
    ['2026-01-31', '2026-02-28', '2026-03-31'],
  )
})

test('only recurring schedules show the next-dates preview', () => {
  assert.equal(scheduleShowsPreview({ schedule_type: 'once' }), false)
  assert.equal(scheduleShowsPreview({ schedule_type: 'daily' }), true)
  assert.equal(scheduleShowsPreview({ schedule_type: 'weekly' }), true)
  assert.equal(scheduleShowsPreview({ schedule_type: 'fortnightly' }), true)
  assert.equal(scheduleShowsPreview({ schedule_type: 'monthly' }), true)
  assert.equal(scheduleShowsPreview({ recurrence: 'custom' }), true)
})
