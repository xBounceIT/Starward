import { expect, test } from '@playwright/test'

import { spawn, type ChildProcess } from 'node:child_process'

import { once } from 'node:events'

import { createServer } from 'node:net'

// Regression test for the cold-start concurrent SSR locale bug: a fresh
// production server must render each of the first concurrent /login requests
// in its own Accept-Language locale, not leak one locale across all of them.
//
// The test spawns its own server.mjs on a dedicated free port so the process
// is guaranteed cold (the shared Playwright webServer has already served the
// health-check URL and may be warm). Raw fetch is used to inspect the SSR'd
// HTML before any client-side rendering.

/** Grab an ephemeral free port and release it before the child binds it. */
async function getFreePort(): Promise<number> {
  const srv = createServer()
  await new Promise<void>((resolve, reject) => {
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => resolve())
  })
  const address = srv.address()
  if (!address || typeof address === 'string') {
    throw new Error('could not allocate a free port')
  }
  const { port } = address
  await new Promise<void>((resolve) => srv.close(() => resolve()))
  return port
}

async function waitForHealth(base: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`)
      if (res.ok) return
      lastErr = new Error(`health returned ${res.status}`)
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`server did not become healthy: ${String(lastErr)}`)
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    once(server, 'exit'),
    new Promise((r) => setTimeout(r, 5_000)),
  ])
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL')
  }
}

test('cold-start: concurrent /login requests each render in their own locale', async () => {
  test.skip(
    !process.env.DATABASE_URL,
    'DATABASE_URL not set; the SSR login page needs a reachable auth database',
  )

  const port = await getFreePort()
  const base = `http://127.0.0.1:${port}`

  const server = spawn('node', ['server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      STARWARD_DEV_MODE: 'true',
      DATABASE_URL: process.env.DATABASE_URL!,
      AUTH_DATABASE_URL: process.env.DATABASE_URL!,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout?.on('data', () => {})
  server.stderr?.on('data', (d) => process.stderr.write(d))

  try {
    await waitForHealth(base)

    // 12 concurrent requests, alternating it-IT and en-US, sent before any
    // other /login request has warmed the server.
    const locales = Array.from({ length: 12 }, (_, i) =>
      i % 2 === 0 ? 'it-IT,it;q=0.9' : 'en-US,en;q=0.9',
    )

    const htmlBodies = await Promise.all(
      locales.map((acceptLanguage) =>
        fetch(`${base}/login`, {
          headers: { 'Accept-Language': acceptLanguage },
        }).then(async (res) => {
          expect(res.status).toBe(200)
          return res.text()
        }),
      ),
    )

    for (let i = 0; i < htmlBodies.length; i++) {
      const html = htmlBodies[i]
      if (locales[i].startsWith('it')) {
        expect(
          html,
          `request #${i} (it) should contain the Italian heading`,
        ).toContain('Accedi al tuo Vault')
        expect(html).not.toContain('Sign in to your Vault')
      } else {
        expect(
          html,
          `request #${i} (en) should contain the English heading`,
        ).toContain('Sign in to your Vault')
        expect(html).not.toContain('Accedi al tuo Vault')
      }
    }
  } finally {
    await stopServer(server)
  }
})
