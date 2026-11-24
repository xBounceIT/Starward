import i18n from 'i18next'

import { initReactI18next } from 'react-i18next'

import en from '@/locales/en'

import it from '@/locales/it'

export const SUPPORTED_LANGUAGES = [
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'English' },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

export type LanguagePreference = LanguageCode | 'auto'

export const LANGUAGE_STORAGE_KEY = 'starward-language'

export const DEFAULT_LANGUAGE: LanguageCode = 'it'

function normalizeLanguageTag(tag: string | undefined | null): string {
  return (tag ?? '').split('-')[0]?.trim().toLowerCase() ?? ''
}

/**
 * Rileva la lingua del browser tramite navigator.languages / navigator.language.
 * Funziona sia su Chrome/Edge sia su Firefox (entrambi espongono
 * navigator.languages). Ritorna la prima lingua supportata trovata,
 * altrimenti la lingua di fallback.
 */
export function detectBrowserLanguage(): LanguageCode {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE
  const candidates: string[] = []
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    candidates.push(...navigator.languages)
  }
  if (navigator.language) candidates.push(navigator.language)
  for (const raw of candidates) {
    const base = normalizeLanguageTag(raw)
    if (base === 'it' || base === 'en') return base
  }
  return DEFAULT_LANGUAGE
}

export function getLanguagePreference(): LanguagePreference {
  if (typeof window === 'undefined') return 'auto'
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (saved === 'it' || saved === 'en' || saved === 'auto') return saved
  } catch {
    // ignore storage errors
  }
  return 'auto'
}

export function resolveLanguage(pref: LanguagePreference): LanguageCode {
  return pref === 'auto' ? detectBrowserLanguage() : pref
}

export function setLanguagePreference(pref: LanguagePreference): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, pref)
    } catch {
      // ignore storage errors
    }
  }
  void i18n.changeLanguage(resolveLanguage(pref))
}

function syncDocumentLanguage(lng: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lng
}

/** Lingua da header Accept-Language (usata dalle route proxy server-side). */
export function languageFromAcceptLanguage(
  header: string | null | undefined,
): LanguageCode {
  if (!header) return DEFAULT_LANGUAGE
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().split('-')[0]?.toLowerCase()
    if (tag === 'it' || tag === 'en') return tag
  }
  return DEFAULT_LANGUAGE
}

/** Traduttore per la lingua della singola request HTTP (route server). */
export function getRequestT(request: Request) {
  return i18n.getFixedT(
    languageFromAcceptLanguage(request.headers.get('accept-language')),
  )
}

const initialPreference = getLanguagePreference()
const initialLanguage = resolveLanguage(initialPreference)

void i18n.use(initReactI18next).init({
  resources: {
    it: { translation: it },
    en: { translation: en },
  },
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: ['it', 'en'],
  nonExplicitSupportedLngs: true,
  defaultNS: 'translation',
  interpolation: {
    // React já escapa i valori: evita double-escaping di {{variabili}}
    escapeValue: false,
  },
  returnEmptyString: false,
  react: {
    useSuspense: false,
  },
})

i18n.on('languageChanged', (lng) => {
  syncDocumentLanguage(lng)
})

syncDocumentLanguage(i18n.language)

/** Traduttore legato all'istanza i18next (usabile anche fuori dai componenti). */
export const t = i18n.t.bind(i18n)

export default i18n
