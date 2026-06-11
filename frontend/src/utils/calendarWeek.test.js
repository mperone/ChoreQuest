import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addDays,
  backendMondayWeekStartsForSundayWeek,
  mondayWeekStart,
  sundayWeekStart,
} from './calendarWeek.js'

test('finds the Sunday week start for any date in the week', () => {
  assert.equal(sundayWeekStart('2026-06-10'), '2026-06-07')
  assert.equal(sundayWeekStart('2026-06-07'), '2026-06-07')
  assert.equal(sundayWeekStart('2026-06-13'), '2026-06-07')
})

test('finds the Monday week start expected by the backend calendar endpoint', () => {
  assert.equal(mondayWeekStart('2026-06-10'), '2026-06-08')
  assert.equal(mondayWeekStart('2026-06-08'), '2026-06-08')
  assert.equal(mondayWeekStart('2026-06-14'), '2026-06-08')
})

test('moves dates by calendar days without timezone drift', () => {
  assert.equal(addDays('2026-06-07', 6), '2026-06-13')
  assert.equal(addDays('2026-06-07', -6), '2026-06-01')
})

test('maps a Sunday-Saturday calendar week to backend Monday weeks', () => {
  assert.deepEqual(
    backendMondayWeekStartsForSundayWeek('2026-06-07'),
    ['2026-06-01', '2026-06-08'],
  )
})
