import { createFileRoute } from '@tanstack/react-router'
import { getSsoProvidersStatus } from '@/lib/sso-config'

export const Route = createFileRoute('/api/sso-providers')({
  server: {
    handlers: {
      GET: async () => {
        const providers = getSsoProvidersStatus()
        return Response.json({ providers })
      },
    },
  },
})
