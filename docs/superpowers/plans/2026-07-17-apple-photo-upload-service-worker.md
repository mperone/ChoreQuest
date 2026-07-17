# Apple Photo Upload Service-Worker Bypass Implementation Plan

> **For Codex:** Follow this plan with test-driven development and verify each command's output before continuing.

**Goal:** Keep Apple mobile multipart uploads on the browser-native network path by preventing the service worker from intercepting non-GET API requests.

**Architecture:** Preserve the existing service worker for cached assets, navigation, and network-first API reads. At the API branch, use the request method as the boundary: non-GET requests return without `respondWith`; GET requests retain their existing offline behavior.

**Tech Stack:** Browser Service Worker API, JavaScript ES modules, Node's built-in test runner and VM module, Vite.

---

### Task 1: Add the service-worker regression coverage

**Files:**
- Create: `frontend/sw.test.js`
- Test: `frontend/sw.test.js`

1. Build a small test harness that evaluates `frontend/public/sw.js` in a VM context and captures its registered `fetch` listener.
2. Add a test that dispatches a POST request to a chore-completion API URL and expects `respondWith` not to be called.
3. Add a preservation test that dispatches a GET request to a non-auth API URL and expects the existing network-first `respondWith` path.
4. Run `node --test frontend/sw.test.js` and confirm the POST test fails because the current service worker intercepts it.

### Task 2: Bypass non-GET API requests

**Files:**
- Modify: `frontend/public/sw.js`
- Test: `frontend/sw.test.js`

1. Inside the `/api/` branch, return before `respondWith` when `request.method !== 'GET'`.
2. Keep the auth bypass and API GET network-first behavior unchanged.
3. Run `node --test frontend/sw.test.js` and confirm both behavioral tests pass.

### Task 3: Verify the frontend package

**Files:**
- Verify: `frontend/vite.config.test.js`
- Verify: `frontend/public/sw.js`

1. Run `node --test frontend/vite.config.test.js frontend/sw.test.js`.
2. Run `npm --prefix frontend run build` and confirm Vite stamps and emits the service worker successfully.
3. Inspect the generated `frontend/dist/sw.js` to confirm non-GET API bypass is present and `__BUILD_TS__` is absent.
4. Run `git diff --check` and review the final diff for scope.
