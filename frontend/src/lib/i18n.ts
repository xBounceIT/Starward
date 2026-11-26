import i18n, { type TFunction } from 'i18next'

import { initReactI18next } from 'react-i18next'

import { createIsomorphicFn } from '@tanstack/react-start'

import { getRequest } from '@tanstack/react-start/server'

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

declare global {
  interface Window {
    /** Lingua usata dal server durante la SSR, serializzata nello stream HTML. */
    __STARWARD_SERVER_LANGUAGE__?: string
  }
}

// During SSR, TanStack Start exposes the current request via getRequest()
// (backed by AsyncLocalStorage), so it is safe to call from any module during
// a request. Outside a request (module load) it throws — we catch and return
// null so the module can be imported at server startup.
const getServerRequest = createIsomorphicFn()
  .server(() => {
    try {
      return getRequest()
    } catch {
      return null
    }
  })
  .client(() => null)

function normalizeLanguageTag(tag: string | undefined | null): string {
  return (tag ?? '').split('-')[0]?.trim().toLowerCase() ?? ''
}

/** Lingua decisa dalla request HTTP corrente (solo durante la SSR). */
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

/** Lingua della request SSR corrente; null outside a request / on the client. */
function languageFromCurrentRequest(): LanguageCode | null {
  if (typeof window === 'undefined') {
    const req = getServerRequest()
    if (req) return languageFromAcceptLanguage(req.headers.get('accept-language'))
  }
  return null
}

/**
 * Rileva la lingua del browser tramite navigator.languages / navigator.language.
 * Sul server (dove `navigator` di Node è finto) usa la lingua della request
 * HTTP corrente, oppure il default se non siamo dentro una request.
 */
export function detectBrowserLanguage(): LanguageCode {
  if (typeof window === 'undefined') {
    return languageFromCurrentRequest() ?? DEFAULT_LANGUAGE
  }
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

/** Lingua effective della request corrente (SSR) o del browser (client). */
export function getRequestLanguage(): LanguageCode {
  return languageFromCurrentRequest() ?? detectBrowserLanguage()
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

/** Traduttore per la lingua della singola request HTTP (route server). */
export function getRequestT(request: Request) {
  return i18n.getFixedT(
    languageFromAcceptLanguage(request.headers.get('accept-language')),
  )
}

// Cache of per-language fixed translators so the SSR hot path does not
// allocate a new TFunction on every t() call.
const fixedTCache = new Map<LanguageCode, TFunction>()

function fixedT(lang: LanguageCode): TFunction {
  let fn = fixedTCache.get(lang)
  if (!fn) {
    fn = i18n.getFixedT(lang)
    fixedTCache.set(lang, fn)
  }
  return fn
}

// Al primo render client usa la lingua serializzata dal server
// (window.__STARWARD_SERVER_LANGUAGE__, iniettata nello stream HTML) cosi'
// l'hydration confronta markup identici; la preferenza locale viene
// applicata dopo il mount.
function getInitialLanguage(): LanguageCode {
  if (typeof window !== 'undefined') {
    const fromServer = window.__STARWARD_SERVER_LANGUAGE__
    if (fromServer === 'it' || fromServer === 'en') return fromServer
  }
  return resolveLanguage(getLanguagePreference())
}

const initialLanguage = getInitialLanguage()

// initImmediate: false makes init synchronous (resources are bundled
// statically), so the instance is ready before the first SSR request and
// cloneInstance() below is also synchronous.
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

/**
 * Traduttore request-scoped: durante la SSR ogni chiamata a `t` usa la
 * lingua dell'Accept-Language della request corrente (via AsyncLocalStorage
 * di TanStack Start), quindi richieste concurrenti con locale diverse non
 * si sovrascrivono a vicenda. Sul client usa l'istanza globale.
 */
export const t = ((key: unknown, options?: unknown) => {
  if (typeof window === 'undefined') {
    return fixedT(languageFromCurrentRequest() ?? DEFAULT_LANGUAGE)(
      key as never,
      options as never,
    )
  }
  return i18n.t(key as never, options as never)
}) as unknown as typeof i18n.t

/**
 * Istanza i18next clonata per la request SSR corrente, con la lingua già
 * impostata. Da usare con <I18nextProvider> nel root durante la SSR così
 * useTranslation() nei componenti figli è request-scoped.
 */
export function getSsrI18n(): typeof i18n {
  const lang = languageFromCurrentRequest() ?? DEFAULT_LANGUAGE
  return i18n.cloneInstance({ lng: lang })
}

export default i18n
