/* global __CHOREQUEST_COMPAT_VERSION__ */

export const COMPAT_HEADER = 'x-chorequest-compat-version'

export const EXPECTED_COMPAT_VERSION =
  typeof __CHOREQUEST_COMPAT_VERSION__ === 'string'
    ? __CHOREQUEST_COMPAT_VERSION__
    : 'dev'

let updateRequired = false

export function isCompatMismatch(
  serverVersion,
  expectedVersion = EXPECTED_COMPAT_VERSION,
) {
  return Boolean(
    serverVersion &&
    expectedVersion &&
    serverVersion !== expectedVersion,
  )
}

export function notifyAppUpdateRequired(
  serverVersion,
  expectedVersion = EXPECTED_COMPAT_VERSION,
  target = globalThis.window,
) {
  if (updateRequired || !target?.dispatchEvent) return false
  updateRequired = true
  target.dispatchEvent(new CustomEvent('app:update-required', {
    detail: { serverVersion, expectedVersion },
  }))
  return true
}

export function checkCompatibilityResponse(
  response,
  expectedVersion = EXPECTED_COMPAT_VERSION,
  target = globalThis.window,
) {
  const serverVersion = response?.headers?.get?.(COMPAT_HEADER)
  if (!isCompatMismatch(serverVersion, expectedVersion)) return false
  notifyAppUpdateRequired(serverVersion, expectedVersion, target)
  return true
}

export function resetCompatibilityStateForTests() {
  updateRequired = false
}
