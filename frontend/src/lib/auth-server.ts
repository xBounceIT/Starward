import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth, ensureAuthMigrated } from '@/lib/auth'
import { getSsoProvidersStatus } from '@/lib/sso-config'

export const getServerSessionFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await ensureAuthMigrated()
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })
    if (!session?.user) return null
    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name || session.user.email,
        image: session.user.image ?? null,
      },
    }
  },
)

export const getSsoProvidersFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    return getSsoProvidersStatus()
  },
)
