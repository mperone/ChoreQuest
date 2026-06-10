import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatScheduleDays, normalizeScheduleDays } from './scheduleDays.js'

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
