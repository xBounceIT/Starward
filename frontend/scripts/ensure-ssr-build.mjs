// Ensures the SSR bundle (dist/server/server.js) exists before Playwright
// starts server.mjs. On a clean checkout `pnpm test:e2e` would otherwise fail
// with ERR_MODULE_NOT_FOUND because server.mjs imports the built bundle.
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const entry = resolve(process.cwd(), 'dist/server/server.js')

if (existsSync(entry)) {
  console.log('[ensure-ssr-build] SSR bundle present, skipping build')
} else {
  console.log('[ensure-ssr-build] dist/server/server.js missing, running build...')
  execSync('pnpm build', { stdio: 'inherit' })
  if (!existsSync(entry)) {
    console.error('[ensure-ssr-build] build finished but dist/server/server.js is still missing')
    process.exit(1)
  }
}
