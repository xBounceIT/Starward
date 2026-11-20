export interface UserSummary {
  id: string
  email: string
  name: string
  image: string | null
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

  searchUsers: (q: string) =>
    request<UserSummary[]>(`/users?q=${encodeURIComponent(q)}`),

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
    payload: { email: string; role: 'editor' | 'viewer' },
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
