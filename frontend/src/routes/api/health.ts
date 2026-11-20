import { createFileRoute } from '@tanstack/react-router'
import { APP_VERSION } from '@/lib/version'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          status: 'ok',
          service: 'starward-frontend',
          version: APP_VERSION,
        }),
    },
  },
})
