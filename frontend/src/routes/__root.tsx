import { useEffect } from 'react'
import {
  HeadContent,
  Outlet,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/lib/theme'
import appCss from '@/styles/app.css?url'

const NO_TRANSITIONS_STYLE =
  'html.no-transitions *,html.no-transitions *::before,html.no-transitions *::after{transition:none!important}'

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
})();`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Starward — Password Manager' },
      {
        name: 'description',
        content:
          'Vault centralizzato con cartelle condivise, cifratura AES-256-GCM e autenticazione locale o SSO.',
      },
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

  return (
    <html lang="it" className="dark" suppressHydrationWarning>
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
