import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const serviceWorkerSource = readFileSync(new URL('./public/sw.js', import.meta.url), 'utf8')

function loadFetchListener() {
  const listeners = new Map()
  const networkRequests = []

  const context = {
    URL,
    Response: class TestResponse {},
    caches: {},
    clients: {},
    fetch(request) {
      networkRequests.push(request)
      return Promise.resolve({ ok: true })
    },
    self: {
      addEventListener(type, listener) {
        listeners.set(type, listener)
      },
      location: { origin: 'https://chores.example.test' },
    },
  }

  runInNewContext(serviceWorkerSource, context, { filename: 'sw.js' })

  return {
    fetchListener: listeners.get('fetch'),
    networkRequests,
  }
}

function dispatch(fetchListener, request) {
  let responsePromise

  fetchListener({
    request,
    respondWith(value) {
      responsePromise = value
    },
  })

  return responsePromise
}

test('leaves non-GET API requests on the browser-native network path', () => {
  const { fetchListener, networkRequests } = loadFetchListener()
  const request = {
    method: 'POST',
    mode: 'cors',
    url: 'https://chores.example.test/api/chores/27/complete',
  }

  const responsePromise = dispatch(fetchListener, request)

  assert.equal(responsePromise, undefined)
  assert.equal(networkRequests.length, 0)
})

test('keeps network-first handling for non-auth API GET requests', async () => {
  const { fetchListener, networkRequests } = loadFetchListener()
  const request = {
    method: 'GET',
    mode: 'cors',
    url: 'https://chores.example.test/api/stats/me',
  }

  const responsePromise = dispatch(fetchListener, request)

  assert.notEqual(responsePromise, undefined)
  await responsePromise
  assert.deepEqual(networkRequests, [request])
})
