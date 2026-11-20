import { createFileRoute } from '@tanstack/react-router'
import { getEnabledSsoProviders } from '@/lib/sso-config'

export const Route = createFileRoute('/api/sso-providers')({
  server: {
    handlers: {
      GET: async () => {
        const providers = getEnabledSsoProviders()
        return Response.json({ providers })
      },
    },
  },
})
