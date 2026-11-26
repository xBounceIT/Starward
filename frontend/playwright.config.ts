import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
  },
  webServer: {
    command: 'node server.mjs',
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      STARWARD_DEV_MODE: 'true',
      ...(process.env.DATABASE_URL
        ? {
            DATABASE_URL: process.env.DATABASE_URL,
            AUTH_DATABASE_URL: process.env.DATABASE_URL,
          }
        : {}),
    },
  },
})
