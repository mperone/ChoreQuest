import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('./ParentDashboard.jsx', import.meta.url), 'utf8')

test('parent dashboard uses a dedicated approval inbox instead of calendar week data', () => {
  assert.match(source, /\/api\/chores\/assignments\/pending-approvals/)
  assert.doesNotMatch(source, /api\('\/api\/calendar'\)/)
})
