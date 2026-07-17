# Apple Photo Upload Service-Worker Bypass

**Date:** 2026-07-17

## Problem

Photo-required chore submissions succeed from desktop Chrome but fail from iPhone Safari with the backend's `Photo proof is required for this quest` response. The selected photo appears as a thumbnail before submission, so the browser has a `File`; however, the backend receives the completion request without a non-empty upload. Nginx Proxy Manager forwards the request and returns the backend's 400 response, which rules out its body-size limits as the source of this specific error.

The production service worker currently calls `respondWith(fetch(request))` for every non-auth `/api/` request. That adds a service-worker interception boundary to multipart uploads. The desktop/iPhone split isolates Apple WebKit plus that boundary as the smallest useful target for a controlled fix.

## Chosen Design

The service worker will return from its `fetch` event without calling `respondWith` for every non-GET `/api/` request. This lets the browser's native networking path send multipart uploads and other mutations directly.

Read-only non-auth API GET requests will retain the existing network-first behavior and JSON offline response. Auth requests will continue to bypass the service worker as they do today. Navigation and static-asset caching behavior will not change.

This general method-based boundary is preferred over special-casing the chore-completion URL because uploads are not the only request bodies that should avoid unnecessary service-worker mediation.

## Alternatives Considered

- Bypass only the photo-completion endpoint. This is narrower, but it hard-codes one route and leaves the same WebKit risk on future multipart or mutation endpoints.
- Change the frontend upload encoding or backend parsing. This touches more of a flow that already works on desktop and does not address the platform-specific service-worker boundary.
- Change Nginx Proxy Manager limits or buffering. The request reaches the application and receives its exact validation response, and the same proxy accepts the desktop upload, so this does not fit the evidence.

## Test Strategy

A Node behavioral test will evaluate the real service-worker script with a minimal fake service-worker environment and invoke its registered `fetch` listener.

The regression checks are:

1. A multipart-style POST to `/api/chores/.../complete` does not call `respondWith` and therefore remains on the browser-native path.
2. A GET to a non-auth `/api/` endpoint still calls `respondWith`, preserving the current network-first API behavior.

The test will be run before the implementation to demonstrate the POST assertion fails against the current code. After the minimal change, the focused service-worker test, existing Vite configuration test, and production frontend build will be run.

## Scope and Rollback

Files in scope are `frontend/public/sw.js` and `frontend/sw.test.js`. The test stays outside `public/` so Vite does not copy it into the production site. Generated `static/` assets, backend code, Nginx Proxy Manager configuration, and the separate refresh-token log error are out of scope.

The change is easy to roll back by restoring non-GET API interception. A new frontend production build will stamp a new service-worker cache name, allowing clients to discover the update through the application's existing update flow.
