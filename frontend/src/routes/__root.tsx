import { useEffect } from 'react'

import {
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'

import { I18nextProvider, useTranslation } from 'react-i18next'

import { Toaster } from '@/components/ui/sonner'

import { TooltipProvider } from '@/components/ui/tooltip'

import i18n, {
  getFixedTFor,
  getLanguagePreference,
  getRequestLanguage,
  getSsrI18n,
  resolveLanguage,
  t,
} from '@/lib/i18n'

import { ThemeProvider } from '@/lib/theme'

import appCss from '@/styles/app.css?url'

const NO_TRANSITIONS_STYLE =
  'html.no-transitions *,html.no-transitions *::before,html.no-transitions *::after{transition:none!important}'

// Keep in sync with CSP_POLICY in server.mjs (sent as an HTTP header there).
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

// Pre-hydration: applica tema e lingua (da localStorage oppure rilevata dal
// browser tramite navigator.languages — funziona sia su Chrome sia su Firefox)
// cosi' <html lang> e i contenuti non "flashano" nella lingua sbagliata.
// `serverLang` e' la lingua usata dal server durante la SSR (da
// Accept-Language): viene serializzata in window.__STARWARD_SERVER_LANGUAGE__
// prima del caricamento dei bundle, cosi' il primo render client usa la stessa
// lingua del markup server e l'hydration non fallisce (React error #418).
const initialLoadScript = (serverLang: string) => `(() => {
  window.__STARWARD_SERVER_LANGUAGE__ = ${JSON.stringify(serverLang)};
  const root = document.documentElement;
  root.classList.add('no-transitions');
  try {
    const saved = localStorage.getItem('starward-theme');
    const theme = saved === 'light' || saved === 'dark' || saved === 'sync-security' ? saved : 'dark';
    root.classList.toggle('dark', theme === 'dark' || theme === 'sync-security');
    root.classList.toggle('sync-security', theme === 'sync-security');
    root.dataset.theme = theme;
  } catch {}
  try {
    const savedLang = localStorage.getItem('starward-language');
    let lang = savedLang === 'it' || savedLang === 'en' ? savedLang : null;
    if (!lang) {
      const nav = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
      for (const raw of nav) {
        const base = (raw || '').split('-')[0].toLowerCase();
        if (base === 'it' || base === 'en') { lang = base; break; }
      }
      if (!lang) lang = 'it';
    }
    root.lang = lang;
  } catch {}
})();`

export const Route = createRootRoute({
  head: () => {
    // During SSR use the request-scoped language (Accept-Language) so each
    // concurrent response gets its own locale; on the client use the live
    // i18n instance language.
    const lang =
      typeof window === 'undefined' ? getRequestLanguage() : (i18n.language as 'it' | 'en')
    const tt = getFixedTFor(lang)
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: tt('root.title') },
        {
          name: 'description',
          content: tt('root.meta-description'),
        },
        { httpEquiv: 'Content-Security-Policy', content: CSP_POLICY },
        { name: 'referrer', content: 'strict-origin-when-cross-origin' },
      ],
      links: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossOrigin: 'anonymous',
        },
        { rel: 'stylesheet', href: appCss },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,slnt,wght@6..144,-10..0,1..1000&display=swap',
        },
      ],
      styles: [{ children: NO_TRANSITIONS_STYLE }],
    }
  },
  component: RootDocument,
})

// During SSR, wrap the tree in an I18nextProvider backed by a per-request
// cloned i18n instance so useTranslation() in every child component reads
// the language of the current request (AsyncLocalStorage), never a shared
// mutable global. This is what makes concurrent cold-start requests render
// each in its own locale.
function RootDocument() {
  if (typeof window === 'undefined') {
    const ssrI18n = getSsrI18n()
    return (
      <I18nextProvider i18n={ssrI18n}>
        <RootHtml />
      </I18nextProvider>
    )
  }
  return <RootHtml />
}

function RootHtml() {
  // useTranslation() iscrive il root al cambio lingua: a ogni cambio
  // l'intero albero viene ri-renderizzato e tutti i t() si aggiornano.
  const { i18n: i18nInstance } = useTranslation()
  const lang = i18nInstance.language

  useEffect(() => {
    let raf1 = 0
    let raf2 = 0
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        document.documentElement.classList.remove('no-transitions')
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t('root.title')
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    if (meta) meta.content = t('root.meta-description')
  }, [lang])

  // Dopo l'hydration allinea la lingua alla preferenza locale (localStorage /
  // browser): il primo render usa la lingua del server, quindi questo cambio
  // avviene post-hydration senza errori di mismatch.
  useEffect(() => {
    const preferred = resolveLanguage(getLanguagePreference())
    if (preferred !== i18nInstance.language) {
      void i18nInstance.changeLanguage(preferred)
    }
  }, [i18nInstance])

  return (
    <html lang={lang} className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <ScriptOnce>{initialLoadScript(lang)}</ScriptOnce>
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <TooltipProvider>
            <Outlet />
          </TooltipProvider>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
