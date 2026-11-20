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
