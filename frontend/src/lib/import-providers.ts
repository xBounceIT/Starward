export interface ImportProviderCatalogEntry {
  id: string
  name: string
  shortDescription: string
  formatsLabel: string
  accept: string
  featured?: boolean
  accentClass: string
  exportGuide: string
}

export const IMPORT_PROVIDERS: ImportProviderCatalogEntry[] = [
  {
    id: 'bitwarden',
    name: 'Bitwarden',
    shortDescription:
      'Vault personale o organizzazione (Login, Note, Carte, Identità, Chiavi SSH)',
    formatsLabel: 'JSON / CSV',
    accept: '.json,.csv,application/json,text/csv',
    featured: true,
    accentClass:
      'border-sky-500/35 bg-sky-500/10 text-sky-600 dark:text-sky-400 sync-security:border-[#ff9c00]/50 sync-security:bg-[#ff9c00]/12 sync-security:text-[#ff9c00]',
    exportGuide:
      'In Bitwarden Web / Desktop / Estensione: Impostazioni o Strumenti → Esporta cassaforte → scegli JSON (non cifrato) per preservare cartelle, collezioni, carte e chiavi SSH, oppure CSV.',
  },
  {
    id: '1password',
    name: '1Password',
    shortDescription: 'Export CSV standard desktop o web',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    accentClass:
      'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
    exportGuide:
      'In 1Password: File → Esporta → Tutte le cassaforti (o una singola) → formato CSV (1Password Interchange / CSV).',
  },
  {
    id: 'lastpass',
    name: 'LastPass',
    shortDescription: 'Credenziali, gruppi, carte, DB e SSH',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    accentClass:
      'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400',
    exportGuide:
      'In LastPass: Opzioni avanzate → Esporta → File CSV di LastPass (salva il file .csv generato).',
  },
  {
    id: 'keepass',
    name: 'KeePass / KeePassXC',
    shortDescription: 'Database 1.x / 2.x e KeePassXC',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    accentClass:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    exportGuide:
      'In KeePassXC: Database → Esporta → File CSV. In KeePass 2.x: File → Export → KeePass CSV (1.x).',
  },
  {
    id: 'chrome',
    name: 'Chrome / Edge / Brave',
    shortDescription: 'Password salvate browser Chromium',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    accentClass:
      'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    exportGuide:
      'Nel browser: Impostazioni → Compilazione automatica e password → Gestore password → Esporta password (.csv).',
  },
  {
    id: 'firefox',
    name: 'Mozilla Firefox',
    shortDescription: 'Export credenziali da about:logins',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    accentClass:
      'border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400',
    exportGuide:
      'In Firefox: apri about:logins → menu (⋯) in alto a destra → Esporta credenziali… → salva come .csv.',
  },
  {
    id: 'safari',
    name: 'Safari / Password Apple',
    shortDescription: 'Export da macOS / iOS / Safari',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    accentClass:
      'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    exportGuide:
      'Su macOS (app Password o Safari): File → Esporta tutte le password… → salva il file CSV.',
  },
  {
    id: 'dashlane',
    name: 'Dashlane',
    shortDescription: 'Export CSV non cifrato con categorie',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    accentClass:
      'border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400',
    exportGuide:
      'In Dashlane: Il mio account → Esporta dati → CSV non cifrato (estrai eventuali file dal pacchetto .zip e seleziona credentials.csv).',
  },
  {
    id: 'protonpass',
    name: 'Proton Pass',
    shortDescription: 'Export CSV con vault e codici TOTP',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    accentClass:
      'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400',
    exportGuide:
      'In Proton Pass: Impostazioni → Esporta → scegli il formato CSV (non cifrato).',
  },
  {
    id: 'nordpass',
    name: 'NordPass',
    shortDescription: 'Login, carte e cartelle NordPass',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    accentClass:
      'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    exportGuide:
      'In NordPass: Impostazioni → Esporta elementi → inserisci la Master Password e salva il file CSV.',
  },
  {
    id: 'generic_csv',
    name: 'CSV Generico',
    shortDescription: 'Tabella personalizzata (IT / EN)',
    formatsLabel: 'CSV',
    accept: '.csv,text/csv',
    accentClass:
      'border-border bg-muted/60 text-muted-foreground',
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
