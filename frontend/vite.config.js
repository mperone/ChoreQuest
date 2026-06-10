import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultBackendTarget = 'http://localhost:8123'

function withoutTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

function resolveBackendTarget(mode) {
  const env = loadEnv(mode, repoRoot, '')
  return withoutTrailingSlash(
    process.env.CHOREQUEST_BACKEND_URL ||
      env.CHOREQUEST_BACKEND_URL ||
      defaultBackendTarget,
  )
}

function resolveWebSocketTarget(backendTarget) {
  const url = new URL(backendTarget)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return withoutTrailingSlash(url.toString())
}

/**
 * Tiny Vite plugin that stamps a build timestamp into public/sw.js
 * so the service worker cache name auto-bumps on every production build.
 * No more manual version bumps.
 */
function swVersionStamp() {
  return {
    name: 'sw-version-stamp',
    writeBundle({ dir }) {
      const outDir = dir || 'dist'
      const swPath = path.resolve(outDir, 'sw.js')
      if (!fs.existsSync(swPath)) return
      const contents = fs.readFileSync(swPath, 'utf-8')
      const stamped = contents.replace('__BUILD_TS__', Date.now().toString(36))
      fs.writeFileSync(swPath, stamped)
    },
  }
}

export default defineConfig(({ mode }) => {
  const backendTarget = resolveBackendTarget(mode)

  return {
    plugins: [react(), tailwindcss(), swVersionStamp()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: backendTarget },
        '/ws': { target: resolveWebSocketTarget(backendTarget), ws: true },
      },
    },
  }
})
