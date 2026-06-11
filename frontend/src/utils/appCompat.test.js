import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkCompatibilityResponse,
  isCompatMismatch,
  resetCompatibilityStateForTests,
} from './appCompat.js'

function responseWithVersion(version) {
  return {
    headers: {
      get(name) {
        return name === 'x-chorequest-compat-version' ? version : null
      },
    },
  }
}

function eventTarget() {
  const events = []
  return {
    events,
    dispatchEvent(event) {
      events.push(event)
    },
  }
}

test('detects mismatched compatibility versions', () => {
  assert.equal(isCompatMismatch('server-v2', 'server-v2'), false)
  assert.equal(isCompatMismatch(null, 'server-v2'), false)
  assert.equal(isCompatMismatch('server-v1', 'server-v2'), true)
})

test('dispatches update-required once for mismatched responses', () => {
  resetCompatibilityStateForTests()
  const target = eventTarget()
  const response = responseWithVersion('server-v2')

  assert.equal(checkCompatibilityResponse(response, 'server-v1', target), true)
  assert.equal(checkCompatibilityResponse(response, 'server-v1', target), true)
  assert.equal(target.events.length, 1)
  assert.equal(target.events[0].type, 'app:update-required')
  assert.deepEqual(target.events[0].detail, {
    serverVersion: 'server-v2',
    expectedVersion: 'server-v1',
  })
})

test('does not dispatch for matching or missing versions', () => {
  resetCompatibilityStateForTests()
  const target = eventTarget()

  assert.equal(
    checkCompatibilityResponse(responseWithVersion('server-v1'), 'server-v1', target),
    false,
  )
  assert.equal(
    checkCompatibilityResponse(responseWithVersion(null), 'server-v1', target),
    false,
  )
  assert.equal(target.events.length, 0)
})
