import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

let loaded = false

export function loadServerEnv() {
  if (loaded) return
  loaded = true
  const envPath = resolve(process.cwd(), '.env')
  if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath)
    } catch {
      // ignore if already loaded or malformed
    }
  }
}

loadServerEnv()

/**
 * Dev mode is opt-in via `STARWARD_DEV_MODE=true`; by default the app runs in
 * production mode and refuses to start with insecure dev defaults.
 */
export function isDevMode(): boolean {
  const v = process.env.STARWARD_DEV_MODE?.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

/**
 * Returns the value of `name`. In dev mode the dev default is allowed; in
 * production the variable must be set to a non-default value, otherwise
 * startup fails fast.
 */
export function requireProdEnv(name: string, devDefault: string): string {
  const raw = process.env[name]?.trim()
  if (raw && (isDevMode() || raw !== devDefault)) return raw
  if (isDevMode()) return devDefault
  throw new Error(
    `${name} must be set to a non-default value in production. ` +
      `Set ${name} to a strong random secret (min 32 chars), ` +
      `or set STARWARD_DEV_MODE=true for local development.`,
  )
}
