import type { Credential } from '@/lib/api'

export type CredentialCategory =
  | 'login'
  | 'api_key'
  | 'database'
  | 'ssh'
  | 'card'
  | 'license'
  | 'note'

export const CREDENTIAL_CATEGORIES: readonly {
  value: CredentialCategory
  label: string
}[] = [
  { value: 'login', label: 'Login Web' },
  { value: 'api_key', label: 'API Key / Token' },
  { value: 'database', label: 'Database' },
  { value: 'ssh', label: 'SSH / Server' },
  { value: 'card', label: 'Carta di pagamento' },
  { value: 'license', label: 'Licenza Software' },
  { value: 'note', label: 'Nota Sicura' },
] as const

export interface CredentialFieldOption {
  value: string
  label: string
}

export interface CredentialFieldDef {
  key: string
  storage: 'core' | 'extra'
  label: string
  placeholder: string
  type:
    | 'text'
    | 'password'
    | 'textarea'
    | 'secret-textarea'
    | 'url'
    | 'select'
    | 'date'
  options?: CredentialFieldOption[]
  required?: boolean
  mono?: boolean
  secret?: boolean
  maskMode?: 'dots' | 'card'
  showGenerator?: boolean
  showStrength?: boolean
  isLink?: boolean
  colSpan?: 1 | 2
  rowsClass?: string
}

export interface CredentialCategoryConfig {
  value: CredentialCategory
  label: string
  fields: CredentialFieldDef[]
}

const DB_TYPE_OPTIONS: CredentialFieldOption[] = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL / MariaDB' },
  { value: 'mongodb', label: 'MongoDB' },
  { value: 'redis', label: 'Redis' },
  { value: 'mssql', label: 'SQL Server' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'other', label: 'Altro' },
]

const ENVIRONMENT_OPTIONS: CredentialFieldOption[] = [
  { value: 'production', label: 'Produzione' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Sviluppo' },
]

export const CREDENTIAL_CATEGORY_CONFIGS: Record<
  CredentialCategory,
  CredentialCategoryConfig
> = {
  login: {
    value: 'login',
    label: 'Login Web',
    fields: [
      {
        key: 'username',
        storage: 'core',
        label: 'Username / Email',
        placeholder: 'admin@azienda.it',
        type: 'text',
        colSpan: 2,
      },
      {
        key: 'password',
        storage: 'core',
        label: 'Password',
        placeholder: 'Inserisci o genera una password sicura',
        type: 'password',
        required: true,
        mono: true,
        secret: true,
        showGenerator: true,
        showStrength: true,
        colSpan: 2,
      },
      {
        key: 'url',
        storage: 'core',
        label: 'URL Sito Web',
        placeholder: 'https://console.example.com',
        type: 'url',
        isLink: true,
        colSpan: 2,
      },
      {
        key: 'notes',
        storage: 'core',
        label: 'Note cifrate',
        placeholder: 'Codici di recupero, dettagli 2FA, istruzioni accesso...',
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  api_key: {
    value: 'api_key',
    label: 'API Key / Token',
    fields: [
      {
        key: 'provider',
        storage: 'extra',
        label: 'Servizio / Provider',
        placeholder: 'es. OpenAI, Stripe, AWS',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'environment',
        storage: 'extra',
        label: 'Ambiente',
        placeholder: 'Seleziona ambiente',
        type: 'select',
        options: ENVIRONMENT_OPTIONS,
        colSpan: 1,
      },
      {
        key: 'username',
        storage: 'core',
        label: 'Key ID / Client ID',
        placeholder: 'es. AKIAIOSFODNN7EXAMPLE',
        type: 'text',
        mono: true,
        colSpan: 2,
      },
      {
        key: 'password',
        storage: 'core',
        label: 'API Key / Secret Token',
        placeholder: 'sk_live_...',
        type: 'password',
        required: true,
        mono: true,
        secret: true,
        showGenerator: true,
        colSpan: 2,
      },
      {
        key: 'url',
        storage: 'core',
        label: 'Endpoint / Base URL',
        placeholder: 'https://api.example.com/v1',
        type: 'url',
        isLink: true,
        colSpan: 1,
      },
      {
        key: 'expires_at',
        storage: 'extra',
        label: 'Data di scadenza',
        placeholder: '',
        type: 'date',
        colSpan: 1,
      },
      {
        key: 'notes',
        storage: 'core',
        label: 'Note cifrate',
        placeholder: 'Permessi, scope, note sulla rotazione...',
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  database: {
    value: 'database',
    label: 'Database',
    fields: [
      {
        key: 'db_type',
        storage: 'extra',
        label: 'Motore Database',
        placeholder: 'Seleziona motore',
        type: 'select',
        options: DB_TYPE_OPTIONS,
        colSpan: 1,
      },
      {
        key: 'database_name',
        storage: 'extra',
        label: 'Nome Database',
        placeholder: 'es. starward_prod',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'url',
        storage: 'core',
        label: 'Host / Indirizzo',
        placeholder: 'db.internal o 10.0.1.5',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'port',
        storage: 'extra',
        label: 'Porta',
        placeholder: '5432',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'username',
        storage: 'core',
        label: 'Utente Database',
        placeholder: 'postgres',
        type: 'text',
        mono: true,
        colSpan: 2,
      },
      {
        key: 'password',
        storage: 'core',
        label: 'Password Database',
        placeholder: 'Password utente database',
        type: 'password',
        required: true,
        mono: true,
        secret: true,
        showGenerator: true,
        showStrength: true,
        colSpan: 2,
      },
      {
        key: 'connection_string',
        storage: 'extra',
        label: 'Stringa di connessione',
        placeholder: 'postgresql://user:pass@host:5432/db',
        type: 'password',
        mono: true,
        secret: true,
        colSpan: 2,
      },
      {
        key: 'notes',
        storage: 'core',
        label: 'Note cifrate',
        placeholder: 'Certificati SSL, tunnel VPN, bastion host...',
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  ssh: {
    value: 'ssh',
    label: 'SSH / Server',
    fields: [
      {
        key: 'url',
        storage: 'core',
        label: 'Host / Indirizzo IP',
        placeholder: '192.168.1.10 o srv.example.com',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'port',
        storage: 'extra',
        label: 'Porta SSH',
        placeholder: '22',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'username',
        storage: 'core',
        label: 'Utente SSH',
        placeholder: 'root o ubuntu',
        type: 'text',
        mono: true,
        colSpan: 2,
      },
      {
        key: 'password',
        storage: 'core',
        label: 'Password / Passphrase',
        placeholder: 'Opzionale se usi una chiave privata',
        type: 'password',
        mono: true,
        secret: true,
        showGenerator: true,
        showStrength: true,
        colSpan: 2,
      },
      {
        key: 'private_key',
        storage: 'extra',
        label: 'Chiave Privata (PEM / OpenSSH)',
        placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----',
        type: 'secret-textarea',
        mono: true,
        secret: true,
        colSpan: 2,
      },
      {
        key: 'public_key',
        storage: 'extra',
        label: 'Chiave Pubblica / Fingerprint',
        placeholder: 'ssh-ed25519 AAAA...',
        type: 'text',
        mono: true,
        colSpan: 2,
      },
      {
        key: 'notes',
        storage: 'core',
        label: 'Note cifrate',
        placeholder: 'Jump host, istruzioni firewall, comandi...',
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  card: {
    value: 'card',
    label: 'Carta di pagamento',
    fields: [
      {
        key: 'username',
        storage: 'core',
        label: 'Titolare carta',
        placeholder: 'Mario Rossi',
        type: 'text',
        colSpan: 2,
      },
      {
        key: 'password',
        storage: 'core',
        label: 'Numero carta',
        placeholder: '4532 0000 0000 0000',
        type: 'password',
        required: true,
        mono: true,
        secret: true,
        maskMode: 'card',
        colSpan: 2,
      },
      {
        key: 'expiry',
        storage: 'extra',
        label: 'Scadenza (MM/AA)',
        placeholder: '12/28',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'cvv',
        storage: 'extra',
        label: 'CVV / CVC',
        placeholder: '123',
        type: 'password',
        mono: true,
        secret: true,
        colSpan: 1,
      },
      {
        key: 'brand',
        storage: 'extra',
        label: 'Circuito / Banca',
        placeholder: 'Visa, Mastercard, Amex...',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'pin',
        storage: 'extra',
        label: 'PIN (opzionale)',
        placeholder: '••••',
        type: 'password',
        mono: true,
        secret: true,
        colSpan: 1,
      },
      {
        key: 'notes',
        storage: 'core',
        label: 'Note cifrate',
        placeholder: 'Indirizzo di fatturazione, massimali, note...',
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  license: {
    value: 'license',
    label: 'Licenza Software',
    fields: [
      {
        key: 'product',
        storage: 'extra',
        label: 'Prodotto / Software',
        placeholder: 'es. JetBrains All Products',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'expires_at',
        storage: 'extra',
        label: 'Scadenza / Rinnovo',
        placeholder: 'es. 2027-01-15 o Perpetua',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'username',
        storage: 'core',
        label: 'Email / Intestatario',
        placeholder: 'licenze@azienda.it',
        type: 'text',
        colSpan: 2,
      },
      {
        key: 'password',
        storage: 'core',
        label: 'Chiave di licenza / Seriale',
        placeholder: 'XXXX-XXXX-XXXX-XXXX',
        type: 'password',
        required: true,
        mono: true,
        secret: true,
        colSpan: 2,
      },
      {
        key: 'url',
        storage: 'core',
        label: 'URL Portale / Download',
        placeholder: 'https://account.vendor.com',
        type: 'url',
        isLink: true,
        colSpan: 2,
      },
      {
        key: 'notes',
        storage: 'core',
        label: 'Note cifrate',
        placeholder: 'Numero postazioni, riferimenti fattura...',
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  note: {
    value: 'note',
    label: 'Nota Sicura',
    fields: [
      {
        key: 'notes',
        storage: 'core',
        label: 'Contenuto nota cifrata',
        placeholder:
          'Scrivi qui la tua nota sicura, codici di recupero o istruzioni riservate...',
        type: 'textarea',
        required: true,
        rowsClass: 'min-h-40',
        colSpan: 2,
      },
    ],
  },
}

export function getCategoryConfig(category: string): CredentialCategoryConfig {
  if (category in CREDENTIAL_CATEGORY_CONFIGS) {
    return CREDENTIAL_CATEGORY_CONFIGS[category as CredentialCategory]
  }
  return CREDENTIAL_CATEGORY_CONFIGS.login
}

export function getCategoryLabel(category: string): string {
  return getCategoryConfig(category).label
}

export function getSelectOptionLabel(
  field: CredentialFieldDef,
  value: string,
): string {
  if (!field.options) return value
  return field.options.find((opt) => opt.value === value)?.label ?? value
}

export function maskSecretValue(
  value: string,
  maskMode: 'dots' | 'card' = 'dots',
): string {
  if (maskMode === 'card') {
    const trimmed = value.replace(/\s+/g, '')
    if (trimmed.length >= 4) {
      return `•••• •••• •••• ${trimmed.slice(-4)}`
    }
  }
  return '•'.repeat(Math.min(20, Math.max(10, value.length)))
}

export function getCredentialSubtitle(cred: Credential): string {
  const fields = cred.fields ?? {}
  switch (cred.category) {
    case 'note': {
      const firstLine = cred.notes
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean)
      return firstLine || 'Nota cifrata'
    }
    case 'database': {
      const dbConfig = getCategoryConfig('database')
      const dbTypeField = dbConfig.fields.find((f) => f.key === 'db_type')
      const engine =
        fields.db_type && dbTypeField
          ? getSelectOptionLabel(dbTypeField, fields.db_type)
          : ''
      const hostPort = cred.url
        ? fields.port
          ? `${cred.url}:${fields.port}`
          : cred.url
        : ''
      const parts = [engine, hostPort || cred.username].filter(Boolean)
      return parts.join(' · ') || 'Database'
    }
    case 'ssh': {
      if (cred.username && cred.url) {
        return fields.port
          ? `${cred.username}@${cred.url}:${fields.port}`
          : `${cred.username}@${cred.url}`
      }
      return cred.url || cred.username || 'Server SSH'
    }
    case 'api_key': {
      const apiConfig = getCategoryConfig('api_key')
      const envField = apiConfig.fields.find((f) => f.key === 'environment')
      const envLabel =
        fields.environment && envField
          ? getSelectOptionLabel(envField, fields.environment)
          : ''
      const parts = [fields.provider, envLabel, cred.username || cred.url].filter(
        Boolean,
      )
      return parts.join(' · ') || 'API Key'
    }
    case 'card': {
      const last4 = cred.password.replace(/\s+/g, '').slice(-4)
      const masked = last4 ? `•••• ${last4}` : ''
      const parts = [fields.brand, masked, cred.username].filter(Boolean)
      return parts.join(' · ') || 'Carta di pagamento'
    }
    case 'license': {
      const parts = [fields.product, cred.username, cred.url].filter(Boolean)
      return parts.join(' · ') || 'Licenza Software'
    }
    default:
      return cred.username || cred.url || 'Nessun username'
  }
}

export function getCredentialQuickCopy(cred: Credential): {
  primary?: { label: string; value: string }
  secondary?: { label: string; value: string }
} {
  const fields = cred.fields ?? {}
  switch (cred.category) {
    case 'note':
      return cred.notes
        ? { secondary: { label: 'Nota', value: cred.notes } }
        : {}
    case 'ssh': {
      const secondaryValue = cred.password || fields.private_key || ''
      const secondaryLabel = cred.password ? 'Password' : 'Chiave privata'
      return {
        primary: cred.username
          ? { label: 'Utente SSH', value: cred.username }
          : undefined,
        secondary: secondaryValue
          ? { label: secondaryLabel, value: secondaryValue }
          : undefined,
      }
    }
    case 'card':
      return {
        primary: cred.username
          ? { label: 'Titolare', value: cred.username }
          : undefined,
        secondary: cred.password
          ? { label: 'Numero carta', value: cred.password }
          : undefined,
      }
    case 'api_key':
      return {
        primary: cred.username
          ? { label: 'Key ID', value: cred.username }
          : undefined,
        secondary: cred.password
          ? { label: 'API Key', value: cred.password }
          : undefined,
      }
    case 'license':
      return {
        primary: cred.username
          ? { label: 'Intestatario', value: cred.username }
          : undefined,
        secondary: cred.password
          ? { label: 'Chiave di licenza', value: cred.password }
          : undefined,
      }
    default:
      return {
        primary: cred.username
          ? { label: 'Username', value: cred.username }
          : undefined,
        secondary: cred.password
          ? { label: 'Password', value: cred.password }
          : undefined,
      }
  }
}

export function getSearchableMetadata(cred: Credential): string {
  const fields = cred.fields ?? {}
  return [
    fields.provider,
    fields.environment,
    fields.db_type,
    fields.database_name,
    fields.brand,
    fields.product,
  ]
    .filter(Boolean)
    .join(' ')
}
