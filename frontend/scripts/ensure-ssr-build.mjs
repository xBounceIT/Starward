// Ensures the SSR bundle (dist/server/server.js) exists before Playwright
// starts server.mjs. On a clean checkout `pnpm test:e2e` would otherwise fail
// with ERR_MODULE_NOT_FOUND because server.mjs imports the built bundle.
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Resolve relative to this script (frontend/scripts/) so the check works
// regardless of the caller's cwd.
const frontendDir = fileURLToPath(new URL('..', import.meta.url))
const entry = `${frontendDir}/dist/server/server.js`.replace(/\\/g, '/')

if (existsSync(entry)) {
  console.log('[ensure-ssr-build] SSR bundle present, skipping build')
} else {
  console.log('[ensure-ssr-build] dist/server/server.js missing, running build...')
  execSync('pnpm build', { stdio: 'inherit', cwd: frontendDir })
  if (!existsSync(entry)) {
    console.error('[ensure-ssr-build] build finished but dist/server/server.js is still missing')
    process.exit(1)
  }
}
