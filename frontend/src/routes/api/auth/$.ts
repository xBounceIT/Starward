import { createFileRoute } from '@tanstack/react-router'
import { auth, ensureAuthMigrated } from '@/lib/auth'

async function handleAuth(request: Request) {
  await ensureAuthMigrated()
  return auth.handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => handleAuth(request),
      POST: async ({ request }) => handleAuth(request),
    },
  },
})
