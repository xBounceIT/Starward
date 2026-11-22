export interface ImportProviderCatalogEntry {
  id: string
  name: string
  shortDescription: string
  formatsLabel: string
  accept: string
  keywords: string[]
  exportGuide: string
}

export const IMPORT_PROVIDERS: ImportProviderCatalogEntry[] = [
  {
    id: 'bitwarden',
    name: 'Bitwarden',
    shortDescription:
      'Vault personale, org o Vaultwarden (Login, Passkey, Identità, Note, Carte, SSH)',
    formatsLabel: 'JSON / CSV',
    accept: '.json,.csv,application/json,text/csv',
    keywords: [
      'bitwarden',
      'vaultwarden',
      'json',
      'csv',
      'passkey',
      'fido2',
      'webauthn',
      'identità',
      'identity',
      'ssh',
      'organizzazione',
    ],
    exportGuide:
      'In Bitwarden / Vaultwarden (Web, Desktop o Estensione): Impostazioni o Strumenti → Esporta cassaforte → scegli JSON (non cifrato) per includere passkey (FIDO2), identità, carte, chiavi SSH, cartelle e collezioni (il CSV esporta solo login e note).',
  },
  {
    id: '1password',
    name: '1Password',
    shortDescription: 'Export CSV standard desktop o web',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    keywords: [
      '1password',
      'onepassword',
      '1p',
      'csv',
      'passkey',
      'identità',
      'identity',
    ],
    exportGuide:
      'In 1Password: File → Esporta → Tutte le cassaforti (o una singola) → formato CSV (1Password Interchange / CSV).',
  },
  {
    id: 'lastpass',
    name: 'LastPass',
    shortDescription: 'Credenziali, gruppi, carte, identità, DB e SSH',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    keywords: [
      'lastpass',
      'lp',
      'csv',
      'ssh',
      'identità',
      'identity',
      'passkey',
    ],
    exportGuide:
      'In LastPass: Opzioni avanzate → Esporta → File CSV di LastPass (salva il file .csv generato).',
  },
  {
    id: 'keepass',
    name: 'KeePass / KeePassXC',
    shortDescription: 'Database 1.x / 2.x e KeePassXC',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    keywords: ['keepass', 'keepassxc', 'kdbx', 'database', 'csv'],
    exportGuide:
      'In KeePassXC: Database → Esporta → File CSV. In KeePass 2.x: File → Export → KeePass CSV (1.x).',
  },
  {
    id: 'chrome',
    name: 'Chrome / Edge / Brave',
    shortDescription: 'Password salvate browser Chromium',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    keywords: [
      'chrome',
      'google',
      'edge',
      'microsoft',
      'brave',
      'opera',
      'vivaldi',
      'arc',
      'chromium',
      'browser',
      'csv',
    ],
    exportGuide:
      'Nel browser: Impostazioni → Compilazione automatica e password → Gestore password → Esporta password (.csv).',
  },
  {
    id: 'firefox',
    name: 'Mozilla Firefox',
    shortDescription: 'Export credenziali da about:logins',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    keywords: ['firefox', 'mozilla', 'about:logins', 'browser', 'csv'],
    exportGuide:
      'In Firefox: apri about:logins → menu (⋯) in alto a destra → Esporta credenziali… → salva come .csv.',
  },
  {
    id: 'safari',
    name: 'Safari / Password Apple',
    shortDescription: 'Export da macOS / iOS / Safari',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    keywords: [
      'safari',
      'apple',
      'icloud',
      'keychain',
      'portachiavi',
      'macos',
      'ios',
      'password',
      'browser',
      'csv',
    ],
    exportGuide:
      'Su macOS (app Password o Safari): File → Esporta tutte le password… → salva il file CSV.',
  },
  {
    id: 'dashlane',
    name: 'Dashlane',
    shortDescription: 'Export CSV non cifrato con categorie',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    keywords: ['dashlane', 'csv'],
    exportGuide:
      'In Dashlane: Il mio account → Esporta dati → CSV non cifrato (estrai eventuali file dal pacchetto .zip e seleziona credentials.csv).',
  },
  {
    id: 'protonpass',
    name: 'Proton Pass',
    shortDescription: 'Export CSV con vault e codici TOTP',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    keywords: [
      'proton',
      'protonpass',
      'proton pass',
      'totp',
      'csv',
      'identità',
      'identity',
      'passkey',
    ],
    exportGuide:
      'In Proton Pass: Impostazioni → Esporta → scegli il formato CSV (non cifrato).',
  },
  {
    id: 'nordpass',
    name: 'NordPass',
    shortDescription: 'Login, carte, identità e cartelle NordPass',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    keywords: [
      'nord',
      'nordpass',
      'nord pass',
      'csv',
      'identità',
      'identity',
      'passkey',
    ],
    exportGuide:
      'In NordPass: Impostazioni → Esporta elementi → inserisci la Master Password e salva il file CSV.',
  },
  {
    id: 'generic_csv',
    name: 'CSV Generico',
    shortDescription: 'Tabella personalizzata (IT / EN)',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    keywords: [
      'csv',
      'generico',
      'generic',
      'tabella',
      'excel',
      'foglio',
      'altro',
      'custom',
      'identità',
      'identity',
      'passkey',
    ],
    exportGuide:
      'Qualsiasi file CSV separato da virgola o punto e virgola con intestazioni come title/name, username/email, password, url, notes, folder, tags.',
  },
]

export function getImportProviderMeta(
  id: string,
): ImportProviderCatalogEntry {
  return (
    IMPORT_PROVIDERS.find((p) => p.id === id) ?? IMPORT_PROVIDERS[0]
  )
}
