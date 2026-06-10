import assert from 'node:assert/strict'
import { test } from 'node:test'

import viteConfig from './vite.config.js'

async function resolveConfig(env = {}) {
  const previousValues = new Map()

  for (const key of Object.keys(env)) {
    previousValues.set(key, process.env[key])
    process.env[key] = env[key]
  }

  try {
    if (typeof viteConfig === 'function') {
      return await viteConfig({ command: 'serve', mode: 'development' })
    }
    return viteConfig
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

function apiTarget(config) {
  const apiProxy = config.server.proxy['/api']
  return typeof apiProxy === 'string' ? apiProxy : apiProxy.target
}

test('defaults the dev proxy to the local backend port', async () => {
  const config = await resolveConfig()

  assert.equal(apiTarget(config), 'http://localhost:8123')
  assert.equal(config.server.proxy['/ws'].target, 'ws://localhost:8123')
})

test('uses CHOREQUEST_BACKEND_URL for HTTP and WebSocket proxy targets', async () => {
  const config = await resolveConfig({
    CHOREQUEST_BACKEND_URL: 'http://127.0.0.1:9000',
  })

  assert.equal(apiTarget(config), 'http://127.0.0.1:9000')
  assert.equal(config.server.proxy['/ws'].target, 'ws://127.0.0.1:9000')
})
