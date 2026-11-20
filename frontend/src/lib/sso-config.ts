import '@/lib/env'

export interface SsoProviderDescriptor {
  id: string
  name: string
  kind: 'oidc' | 'social'
  enabled: boolean
  envHint: string
}

export function getSsoProvidersStatus(): SsoProviderDescriptor[] {
  const oidcEnabled = Boolean(
    process.env.SSO_OIDC_CLIENT_ID &&
      process.env.SSO_OIDC_CLIENT_SECRET &&
      process.env.SSO_OIDC_DISCOVERY_URL,
  )
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  )
  const githubEnabled = Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  )
  const microsoftEnabled = Boolean(
    process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET,
  )

  return [
    {
      id: 'enterprise-oidc',
      name: process.env.SSO_OIDC_NAME || 'SSO Aziendale (OIDC)',
      kind: 'oidc',
      enabled: oidcEnabled,
      envHint: 'SSO_OIDC_CLIENT_ID, SSO_OIDC_CLIENT_SECRET, SSO_OIDC_DISCOVERY_URL',
    },
    {
      id: 'google',
      name: 'Google',
      kind: 'social',
      enabled: googleEnabled,
      envHint: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET',
    },
    {
      id: 'github',
      name: 'GitHub',
      kind: 'social',
      enabled: githubEnabled,
      envHint: 'GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET',
    },
    {
      id: 'microsoft',
      name: 'Microsoft Entra ID',
      kind: 'social',
      enabled: microsoftEnabled,
      envHint: 'MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET',
    },
  ]
}
