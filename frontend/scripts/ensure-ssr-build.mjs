// Ensures the SSR bundle (dist/server/server.js) exists and is up to date
// before Playwright starts server.mjs. On a clean checkout `pnpm test:e2e`
// would otherwise fail with ERR_MODULE_NOT_FOUND, and a stale bundle from an
// earlier build would make Playwright test old code instead of the current
// sources.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve relative to this script (frontend/scripts/) so the check works
// regardless of the caller's cwd.
const frontendDir = fileURLToPath(new URL('..', import.meta.url))
const entry = join(frontendDir, 'dist/server/server.js')

// Inputs that affect the built bundle. Anything newer than the bundle makes
// it stale and triggers a rebuild.
const WATCHED_INPUTS = [
  'src',
  'e2e',
  'scripts',
  'server.mjs',
  'vite.config.ts',
  'tsconfig.json',
  'package.json',
  'playwright.config.ts',
]

function maxMtimeMs(path) {
  const st = statSync(path)
  if (st.isFile()) return st.mtimeMs
  let max = st.mtimeMs
  for (const child of readdirSync(path, { withFileTypes: true })) {
    if (child.name === 'node_modules' || child.name.startsWith('.')) continue
    max = Math.max(max, maxMtimeMs(join(path, child.name)))
  }
  return max
}

function isStale() {
  if (!existsSync(entry)) return false
  const bundleMtime = statSync(entry).mtimeMs
  return WATCHED_INPUTS.some((input) => {
    const full = join(frontendDir, input)
    return existsSync(full) && maxMtimeMs(full) > bundleMtime
  })
}

if (existsSync(entry) && !isStale()) {
  console.log('[ensure-ssr-build] SSR bundle is up to date, skipping build')
} else {
  console.log(
    `[ensure-ssr-build] SSR bundle ${existsSync(entry) ? 'is stale' : 'is missing'}, running build...`,
  )
  execSync('pnpm build', { stdio: 'inherit', cwd: frontendDir })
  if (!existsSync(entry)) {
    console.error('[ensure-ssr-build] build finished but dist/server/server.js is still missing')
    process.exit(1)
  }
}
