import type { Credential, CustomField, CustomFieldType } from '@/lib/api'
import { t } from '@/lib/i18n'

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
  { value: "login", get label() { return t('credential-types.login-web') } },
  { value: 'passkey', get label() { return t('credential-types.passkey') } },
  { value: 'identity', get label() { return t('credential-types.identita') } },
  { value: 'api_key', get label() { return t('credential-types.api-key-token') } },
  { value: "database", get label() { return t('credential-types.database-2') } },
  { value: "ssh", get label() { return t('credential-types.ssh-server') } },
  { value: 'card', get label() { return t('credential-types.carta-di-pagamento') } },
  { value: 'license', get label() { return t('credential-types.licenza-software-1') } },
  { value: "note", get label() { return t('credential-types.nota-sicura-1') } },
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
  { value: 'postgresql', get label() { return t('credential-types.postgresql') } },
  { value: 'mysql', get label() { return t('credential-types.mysql-mariadb') } },
  { value: 'mongodb', get label() { return t('credential-types.mongodb') } },
  { value: 'redis', get label() { return t('credential-types.redis') } },
  { value: 'mssql', get label() { return t('credential-types.sql-server') } },
  { value: 'oracle', get label() { return t('credential-types.oracle') } },
  { value: 'sqlite', get label() { return t('credential-types.sqlite') } },
  { value: 'other', get label() { return t('credential-types.altro') } },
]

const ENVIRONMENT_OPTIONS: CredentialFieldOption[] = [
  { value: 'production', get label() { return t('credential-types.produzione') } },
  { value: "staging", get label() { return t('credential-types.staging-2') } },
  { value: 'development', get label() { return t('credential-types.sviluppo') } },
]

const DISCOVERABLE_OPTIONS: CredentialFieldOption[] = [
  { value: 'true', get label() { return t('credential-types.si-resident-key') } },
  { value: 'false', get label() { return t('credential-types.no') } },
]

export const CREDENTIAL_CATEGORY_CONFIGS: Record<
  CredentialCategory,
  CredentialCategoryConfig
> = {
  login: {
    value: "login",
    get label() { return t('credential-types.login-web') },
    fields: [
      {
        key: "username",
        storage: 'core',
        get label() { return t('credential-types.username-email') },
        placeholder: 'admin@azienda.it',
        type: 'text',
        colSpan: 2,
      },
      {
        key: "password",
        storage: 'core',
        get label() { return t('credential-types.password-2') },
        get placeholder() { return t('credential-types.inserisci-o-genera-una-password-sicura') },
        type: "password",
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
        get label() { return t('credential-types.codice-otp-2fa-totp') },
        get placeholder() { return t('credential-types.chiave-base32-es-jbswy3dpehpk3pxp-o-uri-otpauth-') },
        type: 'totp',
        mono: true,
        secret: true,
        colSpan: 2,
      },
      {
        key: 'url',
        storage: 'core',
        get label() { return t('credential-types.url-sito-web') },
        placeholder: 'https://console.example.com',
        type: 'url',
        isLink: true,
        colSpan: 2,
      },
      {
        key: 'notes',
        storage: 'core',
        get label() { return t('credential-types.note-cifrate') },
        get placeholder() { return t('credential-types.codici-di-recupero-dettagli-2fa-istruzioni-acces') },
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  passkey: {
    value: 'passkey',
    get label() { return t('credential-types.passkey') },
    fields: [
      {
        key: "username",
        storage: 'core',
        get label() { return t('credential-types.username-account') },
        placeholder: 'utente@esempio.it',
        type: 'text',
        colSpan: 2,
      },
      {
        key: 'rp_id',
        storage: 'extra',
        get label() { return t('credential-types.relying-party-id-rp-id') },
        placeholder: 'github.com',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'rp_name',
        storage: 'extra',
        get label() { return t('credential-types.servizio-relying-party') },
        get placeholder() { return t('credential-types.github') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'user_display_name',
        storage: 'extra',
        get label() { return t('credential-types.nome-visualizzato') },
        get placeholder() { return t('credential-types.mario-rossi') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'user_handle',
        storage: 'extra',
        get label() { return t('credential-types.user-handle') },
        get placeholder() { return t('credential-types.base64url-opaque-id') },
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'credential_id',
        storage: 'extra',
        get label() { return t('credential-types.credential-id') },
        get placeholder() { return t('credential-types.id-credenziale-webauthn-fido2') },
        type: 'text',
        mono: true,
        colSpan: 2,
      },
      {
        key: 'private_key',
        storage: 'extra',
        get label() { return t('credential-types.chiave-privata-pkcs-8-fido2') },
        placeholder: 'MIGHAgEAMBMGByqGSM49AgEG...',
        type: 'secret-textarea',
        mono: true,
        secret: true,
        colSpan: 2,
      },
      {
        key: 'key_type',
        storage: 'extra',
        get label() { return t('credential-types.tipo-chiave') },
        placeholder: 'public-key',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'key_algorithm',
        storage: 'extra',
        get label() { return t('credential-types.algoritmo') },
        placeholder: 'ECDSA',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'key_curve',
        storage: 'extra',
        get label() { return t('credential-types.curva-crittografica') },
        placeholder: 'P-256',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'discoverable',
        storage: 'extra',
        get label() { return t('credential-types.discoverable') },
        get placeholder() { return t('credential-types.seleziona') },
        type: 'select',
        options: DISCOVERABLE_OPTIONS,
        colSpan: 1,
      },
      {
        key: 'counter',
        storage: 'extra',
        get label() { return t('credential-types.contatore-firme') },
        placeholder: '0',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'creation_date',
        storage: 'extra',
        get label() { return t('credential-types.data-creazione') },
        placeholder: '2026-01-01T00:00:00Z',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'url',
        storage: 'core',
        get label() { return t('credential-types.url-sito-web') },
        placeholder: 'https://github.com',
        type: 'url',
        isLink: true,
        colSpan: 2,
      },
      {
        key: 'notes',
        storage: 'core',
        get label() { return t('credential-types.note-cifrate') },
        get placeholder() { return t('credential-types.dispositivo-registrato-dettagli-passkey-note-rec') },
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  identity: {
    value: 'identity',
    get label() { return t('credential-types.identita') },
    fields: [
      {
        key: 'identity_title',
        storage: 'extra',
        get label() { return t('credential-types.titolo-appellativo') },
        get placeholder() { return t('credential-types.sig-dott-ing') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'first_name',
        storage: 'extra',
        get label() { return t('credential-types.nome') },
        get placeholder() { return t('credential-types.mario') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'middle_name',
        storage: 'extra',
        get label() { return t('credential-types.secondo-nome') },
        get placeholder() { return t('credential-types.luigi') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'last_name',
        storage: 'extra',
        get label() { return t('credential-types.cognome') },
        get placeholder() { return t('credential-types.rossi') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'company',
        storage: 'extra',
        get label() { return t('credential-types.azienda-organizzazione') },
        get placeholder() { return t('credential-types.acme-s-r-l') },
        type: 'text',
        colSpan: 2,
      },
      {
        key: "username",
        storage: 'core',
        get label() { return t('credential-types.email') },
        placeholder: 'mario.rossi@azienda.it',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'phone',
        storage: 'extra',
        get label() { return t('credential-types.telefono') },
        placeholder: '+39 02 1234567',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'identity_username',
        storage: 'extra',
        get label() { return t('credential-types.username-2') },
        get placeholder() { return t('credential-types.mrossi') },
        type: 'text',
        colSpan: 2,
      },
      {
        key: 'address1',
        storage: 'extra',
        get label() { return t('credential-types.indirizzo-riga-1') },
        get placeholder() { return t('credential-types.via-roma-10') },
        type: 'text',
        colSpan: 2,
      },
      {
        key: 'address2',
        storage: 'extra',
        get label() { return t('credential-types.indirizzo-riga-2') },
        get placeholder() { return t('credential-types.scala-b-int-4') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'address3',
        storage: 'extra',
        get label() { return t('credential-types.indirizzo-riga-3') },
        placeholder: 'Presso...',
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'city',
        storage: 'extra',
        get label() { return t('credential-types.citta') },
        get placeholder() { return t('credential-types.milano') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'state',
        storage: 'extra',
        get label() { return t('credential-types.provincia-stato') },
        get placeholder() { return t('credential-types.mi') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'postal_code',
        storage: 'extra',
        get label() { return t('credential-types.cap-codice-postale') },
        placeholder: '20121',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'country',
        storage: 'extra',
        get label() { return t('credential-types.paese') },
        get placeholder() { return t('credential-types.italia') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'ssn',
        storage: 'extra',
        get label() { return t('credential-types.codice-fiscale-ssn') },
        placeholder: 'RSSMRA80A01F205X',
        type: "password",
        mono: true,
        secret: true,
        colSpan: 2,
      },
      {
        key: 'passport_number',
        storage: 'extra',
        get label() { return t('credential-types.numero-passaporto') },
        placeholder: 'YA1234567',
        type: "password",
        mono: true,
        secret: true,
        colSpan: 1,
      },
      {
        key: 'license_number',
        storage: 'extra',
        get label() { return t('credential-types.patente-documento') },
        placeholder: 'MI1234567A',
        type: "password",
        mono: true,
        secret: true,
        colSpan: 1,
      },
      {
        key: 'notes',
        storage: 'core',
        get label() { return t('credential-types.note-cifrate') },
        get placeholder() { return t('credential-types.note-personali-riferimenti-aggiuntivi') },
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  api_key: {
    value: 'api_key',
    get label() { return t('credential-types.api-key-token') },
    fields: [
      {
        key: "provider",
        storage: 'extra',
        get label() { return t('credential-types.servizio-provider') },
        get placeholder() { return t('credential-types.es-openai-stripe-aws') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'environment',
        storage: 'extra',
        get label() { return t('credential-types.ambiente') },
        get placeholder() { return t('credential-types.seleziona-ambiente') },
        type: 'select',
        options: ENVIRONMENT_OPTIONS,
        colSpan: 1,
      },
      {
        key: "username",
        storage: 'core',
        get label() { return t('credential-types.key-id-client-id') },
        get placeholder() { return t('credential-types.es-akiaiosfodnn7example') },
        type: 'text',
        mono: true,
        colSpan: 2,
      },
      {
        key: "password",
        storage: 'core',
        get label() { return t('credential-types.api-key-secret-token') },
        placeholder: 'sk_live_...',
        type: "password",
        required: true,
        mono: true,
        secret: true,
        showGenerator: true,
        colSpan: 2,
      },
      {
        key: 'url',
        storage: 'core',
        get label() { return t('credential-types.endpoint-base-url') },
        placeholder: 'https://api.example.com/v1',
        type: 'url',
        isLink: true,
        colSpan: 1,
      },
      {
        key: 'expires_at',
        storage: 'extra',
        get label() { return t('credential-types.data-di-scadenza') },
        placeholder: '',
        type: 'date',
        colSpan: 1,
      },
      {
        key: 'notes',
        storage: 'core',
        get label() { return t('credential-types.note-cifrate') },
        get placeholder() { return t('credential-types.permessi-scope-note-sulla-rotazione') },
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  database: {
    value: "database",
    get label() { return t('credential-types.database-2') },
    fields: [
      {
        key: 'db_type',
        storage: 'extra',
        get label() { return t('credential-types.motore-database') },
        get placeholder() { return t('credential-types.seleziona-motore') },
        type: 'select',
        options: DB_TYPE_OPTIONS,
        colSpan: 1,
      },
      {
        key: 'database_name',
        storage: 'extra',
        get label() { return t('credential-types.nome-database') },
        get placeholder() { return t('credential-types.es-starward-prod') },
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'url',
        storage: 'core',
        get label() { return t('credential-types.host-indirizzo') },
        get placeholder() { return t('credential-types.db-internal-o-10-0-1-5') },
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'port',
        storage: 'extra',
        get label() { return t('credential-types.porta') },
        placeholder: '5432',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: "username",
        storage: 'core',
        get label() { return t('credential-types.utente-database') },
        get placeholder() { return t('credential-types.postgres') },
        type: 'text',
        mono: true,
        colSpan: 2,
      },
      {
        key: "password",
        storage: 'core',
        get label() { return t('credential-types.password-database') },
        get placeholder() { return t('credential-types.password-utente-database') },
        type: "password",
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
        get label() { return t('credential-types.stringa-di-connessione') },
        placeholder: 'postgresql://user:pass@host:5432/db',
        type: "password",
        mono: true,
        secret: true,
        colSpan: 2,
      },
      {
        key: 'notes',
        storage: 'core',
        get label() { return t('credential-types.note-cifrate') },
        get placeholder() { return t('credential-types.certificati-ssl-tunnel-vpn-bastion-host') },
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  ssh: {
    value: "ssh",
    get label() { return t('credential-types.ssh-server') },
    fields: [
      {
        key: 'url',
        storage: 'core',
        get label() { return t('credential-types.host-indirizzo-ip') },
        get placeholder() { return t('credential-types.192-168-1-10-o-srv-example-com') },
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: 'port',
        storage: 'extra',
        get label() { return t('credential-types.porta-ssh') },
        placeholder: '22',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: "username",
        storage: 'core',
        get label() { return t('credential-types.utente-ssh') },
        get placeholder() { return t('credential-types.root-o-ubuntu') },
        type: 'text',
        mono: true,
        colSpan: 2,
      },
      {
        key: "password",
        storage: 'core',
        get label() { return t('credential-types.password-passphrase') },
        get placeholder() { return t('credential-types.opzionale-se-usi-una-chiave-privata') },
        type: "password",
        mono: true,
        secret: true,
        showGenerator: true,
        showStrength: true,
        colSpan: 2,
      },
      {
        key: 'private_key',
        storage: 'extra',
        get label() { return t('credential-types.chiave-privata-pem-openssh') },
        get placeholder() { return t('credential-types.begin-openssh-private-key') },
        type: 'secret-textarea',
        mono: true,
        secret: true,
        colSpan: 2,
      },
      {
        key: 'public_key',
        storage: 'extra',
        get label() { return t('credential-types.chiave-pubblica-fingerprint') },
        get placeholder() { return t('credential-types.ssh-ed25519-aaaa') },
        type: 'text',
        mono: true,
        colSpan: 2,
      },
      {
        key: 'notes',
        storage: 'core',
        get label() { return t('credential-types.note-cifrate') },
        get placeholder() { return t('credential-types.jump-host-istruzioni-firewall-comandi') },
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  card: {
    value: 'card',
    get label() { return t('credential-types.carta-di-pagamento') },
    fields: [
      {
        key: "username",
        storage: 'core',
        get label() { return t('credential-types.titolare-carta') },
        get placeholder() { return t('credential-types.mario-rossi') },
        type: 'text',
        colSpan: 2,
      },
      {
        key: "password",
        storage: 'core',
        get label() { return t('credential-types.numero-carta') },
        placeholder: '4532 0000 0000 0000',
        type: "password",
        required: true,
        mono: true,
        secret: true,
        maskMode: 'card',
        colSpan: 2,
      },
      {
        key: 'expiry',
        storage: 'extra',
        get label() { return t('credential-types.scadenza-mm-aa') },
        placeholder: '12/28',
        type: 'text',
        mono: true,
        colSpan: 1,
      },
      {
        key: "cvv",
        storage: 'extra',
        get label() { return t('credential-types.cvv-cvc') },
        placeholder: '123',
        type: "password",
        mono: true,
        secret: true,
        colSpan: 1,
      },
      {
        key: 'brand',
        storage: 'extra',
        get label() { return t('credential-types.circuito-banca') },
        get placeholder() { return t('credential-types.visa-mastercard-amex') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: "pin",
        storage: 'extra',
        get label() { return t('credential-types.pin-opzionale') },
        placeholder: '••••',
        type: "password",
        mono: true,
        secret: true,
        colSpan: 1,
      },
      {
        key: 'notes',
        storage: 'core',
        get label() { return t('credential-types.note-cifrate') },
        get placeholder() { return t('credential-types.indirizzo-di-fatturazione-massimali-note') },
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  license: {
    value: 'license',
    get label() { return t('credential-types.licenza-software-1') },
    fields: [
      {
        key: 'product',
        storage: 'extra',
        get label() { return t('credential-types.prodotto-software') },
        get placeholder() { return t('credential-types.es-jetbrains-all-products') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: 'expires_at',
        storage: 'extra',
        get label() { return t('credential-types.scadenza-rinnovo') },
        get placeholder() { return t('credential-types.es-2027-01-15-o-perpetua') },
        type: 'text',
        colSpan: 1,
      },
      {
        key: "username",
        storage: 'core',
        get label() { return t('credential-types.email-intestatario') },
        placeholder: 'licenze@azienda.it',
        type: 'text',
        colSpan: 2,
      },
      {
        key: "password",
        storage: 'core',
        get label() { return t('credential-types.chiave-di-licenza-seriale') },
        placeholder: 'XXXX-XXXX-XXXX-XXXX',
        type: "password",
        required: true,
        mono: true,
        secret: true,
        colSpan: 2,
      },
      {
        key: 'url',
        storage: 'core',
        get label() { return t('credential-types.url-portale-download') },
        placeholder: 'https://account.vendor.com',
        type: 'url',
        isLink: true,
        colSpan: 2,
      },
      {
        key: 'notes',
        storage: 'core',
        get label() { return t('credential-types.note-cifrate') },
        get placeholder() { return t('credential-types.numero-postazioni-riferimenti-fattura') },
        type: 'textarea',
        colSpan: 2,
      },
    ],
  },
  note: {
    value: "note",
    get label() { return t('credential-types.nota-sicura-1') },
    fields: [
      {
        key: 'notes',
        storage: 'core',
        get label() { return t('credential-types.contenuto-nota-cifrata') },
        get placeholder() { return t('credential-types.scrivi-qui-la-tua-nota-sicura-codici-di-recupero') },
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
      return parts.join(' · ') || cred.url || t('credential-types.passkey-fido2')
    }
    case 'identity': {
      const fullName = getIdentityFullName(fields)
      const parts = [
        fullName,
        cred.username || fields.phone,
        fields.company,
      ].filter(Boolean)
      return parts.join(' · ') || getIdentityAddress(fields) || t('credential-types.identita')
    }
    case 'note': {
      const firstLine = cred.notes
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean)
      return firstLine || t('credential-types.nota-cifrata')
    }
    case 'database': {
      const dbConfig = getCategoryConfig(t('credential-types.database-1'))
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
      return parts.join(' · ') || t('credential-types.database-2')
    }
    case 'ssh': {
      if (cred.username && cred.url) {
        return fields.port
          ? `${cred.username}@${cred.url}:${fields.port}`
          : `${cred.username}@${cred.url}`
      }
      return cred.url || cred.username || t('credential-types.server-ssh')
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
      return parts.join(' · ') || t('credential-types.api-key')
    }
    case 'card': {
      const last4 = cred.password.replace(/\s+/g, '').slice(-4)
      const masked = last4 ? `•••• ${last4}` : ''
      const parts = [fields.brand, masked, cred.username].filter(Boolean)
      return parts.join(' · ') || t('credential-types.carta-di-pagamento')
    }
    case 'license': {
      const parts = [fields.product, cred.username, cred.url].filter(Boolean)
      return parts.join(' · ') || t('credential-types.licenza-software-1')
    }
    default:
      return cred.username || cred.url || t('credential-types.nessun-username')
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
      const primaryLabel = cred.username ? t('credential-types.username-2') : 'RP ID'
      const secondaryValue =
        fields.credential_id || fields.private_key || cred.password || ''
      const secondaryLabel = fields.credential_id
        ? t('credential-types.credential-id')
        : t('credential-types.chiave-privata')
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
          ? { label: t('credential-types.email'), value: cred.username }
          : fullName
            ? { label: t('credential-types.nome'), value: fullName }
            : undefined,
        secondary: fields.phone
          ? { label: t('credential-types.telefono'), value: fields.phone }
          : address
            ? { label: t('credential-types.indirizzo'), value: address }
            : fields.ssn
              ? { label: t('credential-types.codice-fiscale'), value: fields.ssn }
              : undefined,
      }
    }
    case 'note':
      return cred.notes
        ? { secondary: { label: t('credential-types.nota'), value: cred.notes } }
        : {}
    case 'ssh': {
      const secondaryValue = cred.password || fields.private_key || ''
      const secondaryLabel = cred.password ? t('credential-types.password-2') : t('credential-types.chiave-privata')
      return {
        primary: cred.username
          ? { label: t('credential-types.utente-ssh'), value: cred.username }
          : undefined,
        secondary: secondaryValue
          ? { label: secondaryLabel, value: secondaryValue }
          : undefined,
      }
    }
    case 'card':
      return {
        primary: cred.username
          ? { label: t('credential-types.titolare'), value: cred.username }
          : undefined,
        secondary: cred.password
          ? { label: t('credential-types.numero-carta'), value: cred.password }
          : undefined,
      }
    case 'api_key':
      return {
        primary: cred.username
          ? { label: t('credential-types.key-id'), value: cred.username }
          : undefined,
        secondary: cred.password
          ? { label: t('credential-types.api-key'), value: cred.password }
          : undefined,
      }
    case 'license':
      return {
        primary: cred.username
          ? { label: 'Intestatario', value: cred.username }
          : undefined,
        secondary: cred.password
          ? { label: t('credential-types.chiave-di-licenza'), value: cred.password }
          : undefined,
      }
    default:
      return {
        primary: cred.username
          ? { label: t('credential-types.username-2'), value: cred.username }
          : undefined,
        secondary: cred.password
          ? { label: t('credential-types.password-2'), value: cred.password }
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
      const primary = fullName || cred.username || fields.company || t('credential-types.identita')
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
          secondary = t('credential-types.ssh-v0-v1', { v0: cred.url, v1: portPart })
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
      const primary = cred.username || fields.brand || t('credential-types.carta-di-pagamento')
      const secondary = maskSecretValue(cred.password, 'card')
      return { primary, secondary }
    }
    case 'license': {
      const primary = cred.username || fields.product || t('credential-types.licenza-software-2')
      const secondary =
        cred.url ||
        (fields.expires_at ? t('credential-types.scadenza-v0', { v0: fields.expires_at }) : '')
      return { primary, secondary }
    }
    case 'note': {
      const firstLine = cred.notes
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean)
      return {
        primary: firstLine || t('credential-types.nota-sicura-2'),
        secondary: t('credential-types.nota-cifrata'),
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

export interface CustomFieldTypeOption {
  value: CustomFieldType
  label: string
  description: string
}

export const CUSTOM_FIELD_TYPE_OPTIONS: readonly CustomFieldTypeOption[] = [
  {
    value: 'text',
    get label() { return t('credential-types.cf-text-label') },
    get description() { return t('credential-types.cf-text-desc') },
  },
  {
    value: 'hidden',
    get label() { return t('credential-types.cf-hidden-label') },
    get description() { return t('credential-types.cf-hidden-desc') },
  },
  {
    value: 'checkbox',
    get label() { return t('credential-types.cf-checkbox-label') },
    get description() {
      return t('credential-types.cf-checkbox-desc')
    },
  },
  {
    value: 'linked',
    get label() { return t('credential-types.cf-linked-label') },
    get description() {
      return t('credential-types.cf-linked-desc')
    },
  },
] as const

// ID di collegamento compatibili con Bitwarden LinkedIdType
export const LINKED_ID_USERNAME = 100
export const LINKED_ID_PASSWORD = 101
export const LINKED_ID_URI = 102

export const LINKED_FIELD_OPTIONS: readonly { value: number; label: string }[] = [
  { value: LINKED_ID_USERNAME, label: 'Username' },
  { value: LINKED_ID_PASSWORD, label: 'Password' },
  { value: LINKED_ID_URI, label: 'URL' },
] as const

export function getCustomFieldTypeOption(
  type: CustomFieldType,
): CustomFieldTypeOption {
  return (
    CUSTOM_FIELD_TYPE_OPTIONS.find((opt) => opt.value === type) ??
    CUSTOM_FIELD_TYPE_OPTIONS[0]
  )
}

export function getLinkedFieldLabel(linkedId: number | undefined): string {
  return (
    LINKED_FIELD_OPTIONS.find((opt) => opt.value === linkedId)?.label ?? 'Campo'
  )
}

/// Resolves the current value of a "linked" custom field from the credential core fields.
export function resolveLinkedFieldValue(
  cred: Pick<Credential, 'username' | 'password' | 'url'>,
  linkedId: number | undefined,
): string {
  switch (linkedId) {
    case LINKED_ID_USERNAME:
      return cred.username
    case LINKED_ID_PASSWORD:
      return cred.password
    case LINKED_ID_URI:
      return cred.url
    default:
      return ''
  }
}

export function isLinkedFieldSecret(linkedId: number | undefined): boolean {
  return linkedId === LINKED_ID_PASSWORD
}

export function getCustomFieldDisplayValue(
  cred: Pick<Credential, 'username' | 'password' | 'url'>,
  field: CustomField,
): string {
  if (field.field_type === 'linked') {
    return resolveLinkedFieldValue(cred, field.linked_id)
  }
  if (field.field_type === 'checkbox') {
    return field.value === 'true' ? t('credential-types.si') : t('credential-types.no')
  }
  return field.value
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
    ...(cred.custom_fields ?? []).flatMap((cf) => [
      cf.label,
      cf.field_type === 'hidden' || cf.field_type === 'linked'
        ? ''
        : cf.value,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
}
