import type { Credential } from '@/lib/api'

export type CredentialCategory =
  | 'login'
  | 'passkey'
  | 'identity'
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
  { value: 'passkey', label: 'Passkey' },
  { value: 'identity', label: 'Identità' },
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
    | 'totp'
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

const DISCOVERABLE_OPTIONS: CredentialFieldOption[] = [
  { value: 'true', label: 'Sì (Resident Key)' },
  { value: 'false', label: 'No' },
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
        key: 'totp',
        storage: 'extra',
        label: 'Codice OTP (2FA / TOTP)',
        placeholder:
          'Chiave Base32 (es. JBSWY3DPEHPK3PXP) o URI otpauth://totp/...',
        type: 'totp',
        mono: true,
        secret: true,
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
  passkey: {
    value: 'passkey',
    label: 'Passkey',
    fields: [
      {
        key: 'username',
        storage: 'core',
        label: 'Username / Account',
        placeholder: 'utente@esempio.it',
        type: 'text',
        colSpan: 2,
      },
      {
        key: 'rp_id',
        storage: 'extra',
        label: 'Relying Party ID (RP ID)',
        placeholder: 'github.com',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'rp_name',
        storage: 'extra',
        label: 'Servizio / Relying Party',
        placeholder: 'GitHub',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'user_display_name',
        storage: 'extra',
        label: 'Nome visualizzato',
        placeholder: 'Mario Rossi',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'user_handle',
        storage: 'extra',
        label: 'User Handle',
        placeholder: 'base64url / opaque id',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'credential_id',
        storage: 'extra',
        label: 'Credential ID',
        placeholder: 'ID credenziale WebAuthn / FIDO2',
        type: 'text',
        mono: true,
        colSpan: 2,
      },
      {
        key: 'private_key',
        storage: 'extra',
        label: 'Chiave Privata (PKCS#8 / FIDO2)',
        placeholder: 'MIGHAgEAMBMGByqGSM49AgEG...',
        type: 'secret-textarea',
        mono: true,
        secret: true,
        colSpan: 2,
      },
      {
        key: 'key_type',
        storage: 'extra',
        label: 'Tipo chiave',
        placeholder: 'public-key',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'key_algorithm',
        storage: 'extra',
        label: 'Algoritmo',
        placeholder: 'ECDSA',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'key_curve',
        storage: 'extra',
        label: 'Curva crittografica',
        placeholder: 'P-256',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'discoverable',
        storage: 'extra',
        label: 'Discoverable',
        placeholder: 'Seleziona',
        type: 'select',
        options: DISCOVERABLE_OPTIONS,
        colSpan: 1,
      },
      {
        key: 'counter',
        storage: 'extra',
        label: 'Contatore firme',
        placeholder: '0',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'creation_date',
        storage: 'extra',
        label: 'Data creazione',
        placeholder: '2026-01-01T00:00:00Z',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'url',
        storage: 'core',
        label: 'URL Sito Web',
        placeholder: 'https://github.com',
        type: 'url',
        isLink: true,
        colSpan: 2,
      },
      {
        key: 'notes',
        storage: 'core',
        label: 'Note cifrate',
        placeholder: 'Dispositivo registrato, dettagli passkey, note recupero...',
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  identity: {
    value: 'identity',
    label: 'Identità',
    fields: [
      {
        key: 'identity_title',
        storage: 'extra',
        label: 'Titolo / Appellativo',
        placeholder: 'Sig., Dott., Ing.',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'first_name',
        storage: 'extra',
        label: 'Nome',
        placeholder: 'Mario',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'middle_name',
        storage: 'extra',
        label: 'Secondo nome',
        placeholder: 'Luigi',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'last_name',
        storage: 'extra',
        label: 'Cognome',
        placeholder: 'Rossi',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'company',
        storage: 'extra',
        label: 'Azienda / Organizzazione',
        placeholder: 'Acme S.r.l.',
        type: 'text',
        colSpan: 2,
      },
      {
        key: 'username',
        storage: 'core',
        label: 'Email',
        placeholder: 'mario.rossi@azienda.it',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'phone',
        storage: 'extra',
        label: 'Telefono',
        placeholder: '+39 02 1234567',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'identity_username',
        storage: 'extra',
        label: 'Username',
        placeholder: 'mrossi',
        type: 'text',
        colSpan: 2,
      },
      {
        key: 'address1',
        storage: 'extra',
        label: 'Indirizzo (riga 1)',
        placeholder: 'Via Roma 10',
        type: 'text',
        colSpan: 2,
      },
      {
        key: 'address2',
        storage: 'extra',
        label: 'Indirizzo (riga 2)',
        placeholder: 'Scala B, Int. 4',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'address3',
        storage: 'extra',
        label: 'Indirizzo (riga 3)',
        placeholder: 'Presso...',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'city',
        storage: 'extra',
        label: 'Città',
        placeholder: 'Milano',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'state',
        storage: 'extra',
        label: 'Provincia / Stato',
        placeholder: 'MI',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'postal_code',
        storage: 'extra',
        label: 'CAP / Codice postale',
        placeholder: '20121',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'country',
        storage: 'extra',
        label: 'Paese',
        placeholder: 'Italia',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'ssn',
        storage: 'extra',
        label: 'Codice Fiscale / SSN',
        placeholder: 'RSSMRA80A01F205X',
        type: 'password',
        mono: true,
        secret: true,
        colSpan: 2,
      },
      {
        key: 'passport_number',
        storage: 'extra',
        label: 'Numero passaporto',
        placeholder: 'YA1234567',
        type: 'password',
        mono: true,
        secret: true,
        colSpan: 1,
      },
      {
        key: 'license_number',
        storage: 'extra',
        label: 'Patente / Documento',
        placeholder: 'MI1234567A',
        type: 'password',
        mono: true,
        secret: true,
        colSpan: 1,
      },
      {
        key: 'notes',
        storage: 'core',
        label: 'Note cifrate',
        placeholder: 'Note personali, riferimenti aggiuntivi...',
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

export function getIdentityFullName(fields: Record<string, string>): string {
  return [
    fields.identity_title,
    fields.first_name,
    fields.middle_name,
    fields.last_name,
  ]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ')
}

export function getIdentityAddress(fields: Record<string, string>): string {
  return [
    fields.address1,
    fields.address2,
    fields.address3,
    fields.city,
    fields.state,
    fields.postal_code,
    fields.country,
  ]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(', ')
}

export function getCredentialSubtitle(cred: Credential): string {
  const fields = cred.fields ?? {}
  switch (cred.category) {
    case 'passkey': {
      const parts = [
        fields.rp_name || fields.rp_id,
        cred.username || fields.user_display_name,
      ].filter(Boolean)
      return parts.join(' · ') || cred.url || 'Passkey FIDO2'
    }
    case 'identity': {
      const fullName = getIdentityFullName(fields)
      const parts = [
        fullName,
        cred.username || fields.phone,
        fields.company,
      ].filter(Boolean)
      return parts.join(' · ') || getIdentityAddress(fields) || 'Identità'
    }
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
    case 'passkey': {
      const primaryValue = cred.username || fields.rp_id || ''
      const primaryLabel = cred.username ? 'Username' : 'RP ID'
      const secondaryValue =
        fields.credential_id || fields.private_key || cred.password || ''
      const secondaryLabel = fields.credential_id
        ? 'Credential ID'
        : 'Chiave privata'
      return {
        primary: primaryValue
          ? { label: primaryLabel, value: primaryValue }
          : undefined,
        secondary: secondaryValue
          ? { label: secondaryLabel, value: secondaryValue }
          : undefined,
      }
    }
    case 'identity': {
      const fullName = getIdentityFullName(fields)
      const address = getIdentityAddress(fields)
      return {
        primary: cred.username
          ? { label: 'Email', value: cred.username }
          : fullName
            ? { label: 'Nome', value: fullName }
            : undefined,
        secondary: fields.phone
          ? { label: 'Telefono', value: fields.phone }
          : address
            ? { label: 'Indirizzo', value: address }
            : fields.ssn
              ? { label: 'Codice Fiscale', value: fields.ssn }
              : undefined,
      }
    }
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

export function getCredentialListColumns(cred: Credential): {
  primary: string
  secondary: string
} {
  const fields = cred.fields ?? {}

  switch (cred.category) {
    case 'passkey': {
      const primary =
        cred.username ||
        fields.user_display_name ||
        fields.rp_id ||
        'Passkey'
      const credIdPreview = fields.credential_id
        ? fields.credential_id.length > 18
          ? `ID: ${fields.credential_id.slice(0, 18)}…`
          : `ID: ${fields.credential_id}`
        : ''
      const secondary =
        fields.rp_id || cred.url || fields.rp_name || credIdPreview
      return { primary, secondary }
    }
    case 'identity': {
      const fullName = getIdentityFullName(fields)
      const address = getIdentityAddress(fields)
      const primary = fullName || cred.username || fields.company || 'Identità'
      const secondary = [
        cred.username && cred.username !== primary ? cred.username : '',
        fields.phone,
        address,
      ]
        .filter(Boolean)
        .join(' · ')
      return { primary, secondary }
    }
    case 'database': {
      const primary = cred.username || fields.database_name || 'db_user'
      const engine = fields.db_type || 'postgresql'
      let secondary = ''
      if (cred.url) {
        if (cred.url.includes('://')) {
          secondary = cred.url
        } else {
          const portPart =
            fields.port && fields.port !== '5432' ? `:${fields.port}` : ''
          secondary = `${engine}://${cred.url}${portPart}`
        }
      } else if (fields.database_name) {
        secondary = `${engine}://localhost/${fields.database_name}`
      }
      return { primary, secondary }
    }
    case 'ssh': {
      const primary = cred.username || 'root'
      let secondary = ''
      if (cred.url) {
        if (cred.url.includes('://')) {
          secondary = cred.url
        } else {
          const portPart =
            fields.port && fields.port !== '22' ? `:${fields.port}` : ''
          secondary = `ssh://${cred.url}${portPart}`
        }
      }
      return { primary, secondary }
    }
    case 'api_key': {
      let primary = cred.username
      if (!primary) {
        const raw = cred.password.trim()
        const prefixMatch = raw.match(/^([a-zA-Z0-9]{2,5}[-_])/)
        primary = prefixMatch
          ? `${prefixMatch[1]}••••••••••••••••`
          : 'sk-••••••••••••••••'
      }
      const secondary = cred.url || fields.provider || ''
      return { primary, secondary }
    }
    case 'card': {
      const primary = cred.username || fields.brand || 'Carta di pagamento'
      const secondary = maskSecretValue(cred.password, 'card')
      return { primary, secondary }
    }
    case 'license': {
      const primary = cred.username || fields.product || 'Licenza software'
      const secondary =
        cred.url ||
        (fields.expires_at ? `Scadenza: ${fields.expires_at}` : '')
      return { primary, secondary }
    }
    case 'note': {
      const firstLine = cred.notes
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean)
      return {
        primary: firstLine || 'Nota sicura',
        secondary: 'Nota cifrata',
      }
    }
    default: {
      return {
        primary: cred.username || cred.url || '—',
        secondary: cred.username ? cred.url : '',
      }
    }
  }
}

export function parseCredentialTags(cred: Credential): string[] {
  const raw = cred.fields?.tags?.trim()
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
          .map((t) => String(t).trim())
          .filter(Boolean)
      }
    } catch {
      // fallback to comma split
    }
  }
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export function serializeCredentialTags(tags: string[]): string {
  const unique = Array.from(
    new Set(tags.map((t) => t.trim()).filter(Boolean)),
  )
  return unique.join(', ')
}

export function hasCredentialTotp(cred: Pick<Credential, 'fields'>): boolean {
  return Boolean(cred.fields?.totp?.trim())
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
    fields.rp_id,
    fields.rp_name,
    fields.user_display_name,
    fields.credential_id,
    fields.key_algorithm,
    fields.identity_title,
    fields.first_name,
    fields.middle_name,
    fields.last_name,
    fields.company,
    fields.phone,
    fields.identity_username,
    fields.address1,
    fields.city,
    fields.state,
    fields.postal_code,
    fields.country,
    fields.tags,
    hasCredentialTotp(cred) ? 'otp totp 2fa' : '',
  ]
    .filter(Boolean)
    .join(' ')
}
