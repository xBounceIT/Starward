export type UserRole = 'admin' | 'user'

export interface UserSummary {
  id: string
  email: string
  name: string
  image: string | null
  role: UserRole
}

export interface AdminUser {
  id: string
  email: string
  name: string
  image: string | null
  role: UserRole
  vault_count: number
  credential_count: number
  created_at: string
  last_seen_at: string
}

/**
 * Modello evento di Audit di Sistema ("chi ha fatto cosa e quando").
 */
export interface SystemAuditEvent {
  id: string
  actor_id: string
  actor_email: string
  actor_name: string
  actor_role: UserRole
  action: string
  target_type: string
  target_id: string | null
  details: string
  created_at: string
}

export interface SystemAuditQueryParams {
  q?: string
  actor_id?: string
  actor_role?: UserRole
  action?: string
  target_type?: string
  from?: string
  to?: string
  limit?: number
}

export interface VaultMember {
  id: string
  vault_id: string
  user_id: string | null
  email: string
  name: string | null
  image: string | null
  role: 'owner' | 'editor' | 'viewer'
  is_pending: boolean
  created_at: string
}

export interface Vault {
  id: string
  name: string
  description: string
  icon: string
  color: string
  owner_id: string
  owner_name: string
  owner_email: string
  is_personal: boolean
  role: 'owner' | 'editor' | 'viewer'
  is_shared: boolean
  is_shared_with_me: boolean
  member_count: number
  credential_count: number
  members: VaultMember[]
  created_at: string
  updated_at: string
}

export interface Credential {
  id: string
  vault_id: string
  vault_name: string
  vault_color: string
  vault_role: 'owner' | 'editor' | 'viewer'
  title: string
  username: string
  password: string
  url: string
  category: string
  notes: string
  fields: Record<string, string>
  favorite: boolean
  created_by: string
  created_by_name: string
  updated_by: string
  updated_by_name: string
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  vault_id: string
  credential_id: string | null
  actor_id: string
  actor_email: string
  actor_name: string
  action: string
  details: string
  created_at: string
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'sync-security'
  password_generator_length: number
  password_generator_uppercase: boolean
  password_generator_lowercase: boolean
  password_generator_numbers: boolean
  password_generator_symbols: boolean
  default_vault_id: string | null
  updated_at: string
}

export type ApiKeyPermission = 'read' | 'read_write'

export interface ApiKeyItem {
  id: string
  name: string
  key_prefix: string
  permission: ApiKeyPermission
  vault_ids: string[]
  expires_at: string | null
  last_used_at: string | null
  is_expired: boolean
  created_at: string
}

export interface CreatedApiKey {
  api_key: ApiKeyItem
  secret_key: string
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    let code = 'HTTP_ERROR'
    let message = `Errore richiesta (${res.status})`
    try {
      const data = await res.json()
      if (data?.error?.message) {
        message = data.error.message
        code = data.error.code || code
      }
    } catch {
      // ignore non-json errors
    }
    throw new ApiError(res.status, code, message)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return (await res.json()) as T
}

export const vaultApi = {
  me: () => request<UserSummary>('/me'),

  updateProfile: (payload: { name: string }) =>
    request<UserSummary>('/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getSettings: () => request<UserSettings>('/settings'),

  updateSettings: (payload: {
    theme?: 'light' | 'dark' | 'sync-security'
    password_generator_length?: number
    password_generator_uppercase?: boolean
    password_generator_lowercase?: boolean
    password_generator_numbers?: boolean
    password_generator_symbols?: boolean
    default_vault_id?: string
  }) =>
    request<UserSettings>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  listApiKeys: () => request<ApiKeyItem[]>('/api-keys'),

  createApiKey: (payload: {
    name: string
    permission: ApiKeyPermission
    vault_ids?: string[]
    expires_in_days?: number | null
  }) =>
    request<CreatedApiKey>('/api-keys', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteApiKey: (keyId: string) =>
    request<void>(`/api-keys/${keyId}`, {
      method: 'DELETE',
    }),

  searchUsers: (q = '') =>
    request<UserSummary[]>(`/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  listAdminUsers: (params?: { q?: string; role?: string }) => {
    const search = new URLSearchParams()
    if (params?.q) search.set('q', params.q)
    if (params?.role) search.set('role', params.role)
    const qs = search.toString()
    return request<AdminUser[]>(`/admin/users${qs ? `?${qs}` : ''}`)
  },

  updateUserRole: (userId: string, role: UserRole) =>
    request<AdminUser>(`/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  deleteUser: (userId: string) =>
    request<void>(`/admin/users/${userId}`, {
      method: 'DELETE',
    }),

  listSystemAudit: (params?: SystemAuditQueryParams) => {
    const search = new URLSearchParams()
    if (params?.q) search.set('q', params.q)
    if (params?.actor_id) search.set('actor_id', params.actor_id)
    if (params?.actor_role) search.set('actor_role', params.actor_role)
    if (params?.action) search.set('action', params.action)
    if (params?.target_type) search.set('target_type', params.target_type)
    if (params?.from) search.set('from', params.from)
    if (params?.to) search.set('to', params.to)
    if (params?.limit) search.set('limit', String(params.limit))
    const qs = search.toString()
    return request<SystemAuditEvent[]>(`/admin/audit${qs ? `?${qs}` : ''}`)
  },

  listVaults: () => request<Vault[]>('/vaults'),

  createVault: (payload: {
    name: string
    description?: string
    icon?: string
    color?: string
  }) =>
    request<Vault>('/vaults', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateVault: (
    vaultId: string,
    payload: {
      name?: string
      description?: string
      icon?: string
      color?: string
    },
  ) =>
    request<Vault>(`/vaults/${vaultId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteVault: (vaultId: string) =>
    request<void>(`/vaults/${vaultId}`, {
      method: 'DELETE',
    }),

  shareVault: (
    vaultId: string,
    payload: { user_id?: string; email?: string; role: 'editor' | 'viewer' },
  ) =>
    request<Vault>(`/vaults/${vaultId}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMemberRole: (
    vaultId: string,
    memberId: string,
    role: 'editor' | 'viewer',
  ) =>
    request<Vault>(`/vaults/${vaultId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  removeMember: (vaultId: string, memberId: string) =>
    request<void>(`/vaults/${vaultId}/members/${memberId}`, {
      method: 'DELETE',
    }),

  getVaultAudit: (vaultId: string) =>
    request<AuditLog[]>(`/vaults/${vaultId}/audit`),

  listCredentials: (params?: {
    vault_id?: string
    q?: string
    favorite?: boolean
    category?: string
  }) => {
    const search = new URLSearchParams()
    if (params?.vault_id) search.set('vault_id', params.vault_id)
    if (params?.q) search.set('q', params.q)
    if (params?.favorite) search.set('favorite', 'true')
    if (params?.category) search.set('category', params.category)
    const qs = search.toString()
    return request<Credential[]>(`/credentials${qs ? `?${qs}` : ''}`)
  },

  createCredential: (payload: {
    vault_id: string
    title: string
    username?: string
    password?: string
    url?: string
    category?: string
    notes?: string
    fields?: Record<string, string>
    favorite?: boolean
  }) =>
    request<Credential>('/credentials', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCredential: (
    credentialId: string,
    payload: {
      vault_id?: string
      title?: string
      username?: string
      password?: string
      url?: string
      category?: string
      notes?: string
      fields?: Record<string, string>
      favorite?: boolean
    },
  ) =>
    request<Credential>(`/credentials/${credentialId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteCredential: (credentialId: string) =>
    request<void>(`/credentials/${credentialId}`, {
      method: 'DELETE',
    }),
}
