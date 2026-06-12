import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildKidHomeThemeStyles,
  buildPrizeSpinStatus,
} from './kidHomeStatus.js'

test('builds a single subtle theme surface for the kid home', () => {
  const styles = buildKidHomeThemeStyles({ cardAccent: '#14b8a6' })

  assert.equal(styles.surfaceStyle.borderColor, '#14b8a62E')
  assert.equal(
    styles.surfaceStyle.boxShadow,
    '0 0 16px #14b8a610, inset 0 1px 0 #14b8a60D'
  )
  assert.equal(
    styles.surfaceStyle.background,
    'linear-gradient(180deg, #14b8a608 0%, var(--color-surface) 62%)'
  )
  assert.equal(styles.initialStyle.color, '#14b8a6')
})

test('returns no inline theme styles without a card accent', () => {
  assert.deepEqual(buildKidHomeThemeStyles({}), {
    surfaceStyle: undefined,
    initialStyle: undefined,
  })
})

test('locks the prize spin until required chores are done', () => {
  const status = buildPrizeSpinStatus({
    spinEnabled: true,
    requiredTotal: 3,
    requiredLeft: 2,
    requiredComplete: false,
    availability: { can_spin: false },
  })

  assert.deepEqual(status, {
    state: 'locked',
    title: "Today's Prize Spin",
    detail: 'Finish 2 more chores to unlock.',
    buttonLabel: 'Locked',
    canOpen: false,
  })
})

test('makes the prize spin ready after required chores are complete', () => {
  const status = buildPrizeSpinStatus({
    spinEnabled: true,
    requiredTotal: 2,
    requiredLeft: 0,
    requiredComplete: true,
    availability: { can_spin: true },
  })

  assert.deepEqual(status, {
    state: 'ready',
    title: "Today's Prize Spin",
    detail: 'Ready after finishing today.',
    buttonLabel: 'Spin',
    canOpen: true,
  })
})

test('shows collected prize copy after the wheel has been used', () => {
  const status = buildPrizeSpinStatus({
    spinEnabled: true,
    requiredTotal: 2,
    requiredLeft: 0,
    requiredComplete: true,
    availability: { can_spin: false, last_result: 15 },
  })

  assert.deepEqual(status, {
    state: 'used',
    title: "Today's Prize Spin",
    detail: 'Prize collected: +15 XP',
    buttonLabel: 'Done',
    canOpen: false,
  })
})

test('keeps prize spin quiet when there are no required chores', () => {
  const status = buildPrizeSpinStatus({
    spinEnabled: true,
    requiredTotal: 0,
    requiredLeft: 0,
    requiredComplete: false,
    availability: { can_spin: true },
  })

  assert.deepEqual(status, {
    state: 'idle',
    title: "Today's Prize Spin",
    detail: 'No required chores today.',
    buttonLabel: 'No spin',
    canOpen: false,
  })
})
