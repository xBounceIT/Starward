import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/lib/theme'
import appCss from '@/styles/app.css?url'

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
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootDocument,
})

function RootDocument() {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <HeadContent />
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
