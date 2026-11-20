import '@/lib/env'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { genericOAuth } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Pool } from 'pg'

const connectionString =
  process.env.AUTH_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgres://starward:starward@127.0.0.1:5432/starward'

const database = new Pool({
  connectionString,
  max: 10,
})

const genericOAuthConfigs = []
if (
  process.env.SSO_OIDC_CLIENT_ID &&
  process.env.SSO_OIDC_CLIENT_SECRET &&
  process.env.SSO_OIDC_DISCOVERY_URL
) {
  genericOAuthConfigs.push({
    providerId: 'enterprise-oidc',
    clientId: process.env.SSO_OIDC_CLIENT_ID,
    clientSecret: process.env.SSO_OIDC_CLIENT_SECRET,
    discoveryUrl: process.env.SSO_OIDC_DISCOVERY_URL,
    scopes: ['openid', 'email', 'profile'],
    pkce: true,
  })
}

const socialProviders: Record<
  string,
  { clientId: string; clientSecret: string; tenantId?: string }
> = {}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  }
}

if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  socialProviders.microsoft = {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
  }
}

function isWildcardBindHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === '0.0.0.0' || normalized === '::' || normalized === '*'
}

function resolveAuthBaseURL(): BetterAuthOptions['baseURL'] {
  const raw = process.env.BETTER_AUTH_URL?.trim() || 'http://0.0.0.0:3000'
  try {
    const parsed = new URL(raw)
    if (isWildcardBindHost(parsed.hostname)) {
      const protocol = parsed.protocol === 'https:' ? 'https' : 'http'
      const portSuffix = parsed.port ? `:${parsed.port}` : ''
      return {
        allowedHosts: ['*'],
        protocol,
        fallback: `${protocol}://localhost${portSuffix}`,
      }
    }
    return raw
  } catch {
    return raw
  }
}

export const auth = betterAuth({
  appName: 'Starward',
  baseURL: resolveAuthBaseURL(),
  secret:
    process.env.BETTER_AUTH_SECRET ||
    'dev-better-auth-secret-change-in-production-32chars',
  database,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  socialProviders,
  plugins: [
    genericOAuth({
      config: genericOAuthConfigs,
    }),
    tanstackStartCookies(),
  ],
})

let migrationPromise: Promise<void> | null = null

export function ensureAuthMigrated(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const { runMigrations } = await getMigrations(auth.options)
      await runMigrations()
    })().catch((err) => {
      migrationPromise = null
      console.error('Better Auth PostgreSQL migration error:', err)
      throw err
    })
  }
  return migrationPromise
}
