import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bulkToggleState } from './bulkToggleState.js'

test('bulk toggle is off when no selected item is enabled', () => {
  const state = bulkToggleState([
    { selected: true, requires_photo: false },
    { selected: true, requires_photo: false },
    { selected: false, requires_photo: true },
  ], 'requires_photo')

  assert.deepEqual(state, {
    all: false,
    some: false,
    mixed: false,
    nextValue: true,
  })
})

test('bulk toggle is mixed when only some selected items are enabled', () => {
  const state = bulkToggleState([
    { selected: true, is_optional: true },
    { selected: true, is_optional: false },
  ], 'is_optional')

  assert.deepEqual(state, {
    all: false,
    some: true,
    mixed: true,
    nextValue: true,
  })
})

test('bulk toggle turns off only when every selected item is enabled', () => {
  const state = bulkToggleState([
    { selected: true, is_optional: true },
    { selected: true, is_optional: true },
  ], 'is_optional')

  assert.deepEqual(state, {
    all: true,
    some: true,
    mixed: false,
    nextValue: false,
  })
})
