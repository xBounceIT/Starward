import { useEffect } from 'react'

import {
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'

import { useTranslation } from 'react-i18next'

import { Toaster } from '@/components/ui/sonner'

import { TooltipProvider } from '@/components/ui/tooltip'

import { t } from '@/lib/i18n'

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
const INITIAL_LOAD_SCRIPT = `(() => {
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
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: t('root.title') },
      {
        name: 'description',
        content: t('root.meta-description'),
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
  }),
  component: RootDocument,
})

function RootDocument() {
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

  return (
    <html lang={lang} className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <ScriptOnce>{INITIAL_LOAD_SCRIPT}</ScriptOnce>
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
