import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  isoDateInTimeZone,
  todayISOInTimeZone,
} from './daytime.js'

test('formats the same instant as different local dates by timezone', () => {
  const instant = new Date('2026-06-11T22:30:00Z')

  assert.equal(isoDateInTimeZone(instant, 'Europe/Belgrade'), '2026-06-12')
  assert.equal(isoDateInTimeZone(instant, 'America/Chicago'), '2026-06-11')
})

test('falls back to Chicago when timezone is invalid', () => {
  const instant = new Date('2026-06-11T22:30:00Z')

  assert.equal(isoDateInTimeZone(instant, 'Nope/Bad'), '2026-06-11')
})

test('today helper accepts an injected clock', () => {
  const instant = new Date('2026-06-11T22:30:00Z')

  assert.equal(todayISOInTimeZone('Europe/Belgrade', instant), '2026-06-12')
})
