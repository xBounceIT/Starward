import { useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import {
  Building2,
  FolderLock,
  KeyRound,
  Lock,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { authClient } from '@/lib/auth-client'
import { getServerSessionFn, getSsoProvidersFn } from '@/lib/auth-server'
import type { SsoProviderDescriptor } from '@/lib/sso-config'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const session = await getServerSessionFn()
    if (session?.user) {
      throw redirect({ to: '/vault' })
    }
  },
  loader: async () => {
    const ssoProviders = await getSsoProvidersFn()
    return { ssoProviders }
  },
  component: LoginPage,
})

function LoginPage() {
  const { ssoProviders } = Route.useLoaderData()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [ssoLoadingId, setSsoLoadingId] = useState<string | null>(null)
  const [selectedUnconfigured, setSelectedUnconfigured] =
    useState<SsoProviderDescriptor | null>(null)

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authClient.signIn.email({
        email: email.trim(),
        password,
      })
      if (res.error) {
        toast.error(res.error.message || 'Credenziali non valide')
        return
      }
      toast.success('Accesso effettuato')
      await navigate({ to: '/vault' })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore durante il login',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleLocalRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('La password deve contenere almeno 8 caratteri')
      return
    }
    setLoading(true)
    try {
      const res = await authClient.signUp.email({
        name: name.trim() || email.split('@')[0],
        email: email.trim(),
        password,
      })
      if (res.error) {
        toast.error(res.error.message || 'Impossibile completare la registrazione')
        return
      }
      toast.success('Account creato con successo')
      await navigate({ to: '/vault' })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore durante la registrazione',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleSsoClick = async (provider: SsoProviderDescriptor) => {
    if (!provider.enabled) {
      setSelectedUnconfigured(provider)
      toast.info(
        `Configura ${provider.envHint} in frontend/.env per attivare ${provider.name}`,
      )
      return
    }

    setSsoLoadingId(provider.id)
    try {
      await authClient.signIn.social({
        provider: provider.id,
        callbackURL: '/vault',
      })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore avvio flusso SSO',
      )
      setSsoLoadingId(null)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left showcase panel */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight">Starward</span>
            <p className="text-xs text-slate-400">Centralized Password Vault</p>
          </div>
        </div>

        <div className="space-y-8 max-w-md">
          <div className="space-y-3">
            <Badge className="bg-indigo-500/20 text-indigo-200 border-indigo-400/30">
              Rust AES-256-GCM + Better Auth
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight leading-tight">
              Un unico vault sicuro, cartelle condivise come in un file system.
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Gestisci credenziali personali e di team con cifratura
              autenticata lato server, controllo granulare dei ruoli e accesso
              locale o SSO aziendale.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-indigo-300">
                <Users className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Cartelle condivise live</p>
                <p className="text-xs text-slate-400">
                  Condividi una cartella con utenti specifici (Editor o Sola
                  lettura): tutti vedono le credenziali sempre sincronizzate.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-emerald-300">
                <FolderLock className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  Backend Rust & Cifratura AES-256-GCM
                </p>
                <p className="text-xs text-slate-400">
                  Ogni password e nota è cifrata a riposo con nonce univoci e
                  derivazione chiave HKDF-SHA256.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sky-300">
                <KeyRound className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">
                  Accesso Locale o SSO (OIDC / OAuth2)
                </p>
                <p className="text-xs text-slate-400">
                  Supporto nativo Better Auth per account locali, provider OIDC
                  aziendali (Keycloak, Okta, Entra ID) e social login.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Starward Password Manager · Rust + TanStack Start + shadcn/ui
        </p>
      </div>

      {/* Right auth form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-center gap-2.5 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">Starward</span>
          </div>

          <Card className="shadow-md">
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Accedi al tuo Vault</CardTitle>
              <CardDescription>
                Usa un account locale oppure accedi tramite SSO Better Auth.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <Tabs
                value={mode}
                onValueChange={(v) => setMode(v as 'login' | 'register')}
              >
                <TabsList>
                  <TabsTrigger value="login">Accedi</TabsTrigger>
                  <TabsTrigger value="register">Registrati</TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="mt-4">
                  <form onSubmit={handleLocalLogin} className="space-y-3.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="nome@azienda.it"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={loading}
                    >
                      <Lock className="size-4" />
                      {loading ? 'Accesso in corso...' : 'Accedi con email'}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register" className="mt-4">
                  <form onSubmit={handleLocalRegister} className="space-y-3.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-name">Nome completo</Label>
                      <Input
                        id="reg-name"
                        placeholder="Mario Rossi"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-email">Email</Label>
                      <Input
                        id="reg-email"
                        type="email"
                        placeholder="mario.rossi@azienda.it"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-password">
                        Password (min. 8 caratteri)
                      </Label>
                      <Input
                        id="reg-password"
                        type="password"
                        placeholder="Crea una password sicura"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={loading}
                    >
                      {loading ? 'Creazione account...' : 'Crea account locale'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    oppure accedi con SSO
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {ssoProviders.map((provider) => (
                  <Button
                    key={provider.id}
                    type="button"
                    variant={provider.kind === 'oidc' ? 'secondary' : 'outline'}
                    className="w-full justify-between"
                    disabled={ssoLoadingId === provider.id}
                    onClick={() => handleSsoClick(provider)}
                  >
                    <span className="flex items-center gap-2">
                      <Building2 className="size-4 text-primary" />
                      {provider.name}
                    </span>
                    <Badge
                      variant={provider.enabled ? 'success' : 'outline'}
                      className="text-[10px]"
                    >
                      {provider.enabled ? 'Attivo' : 'Da configurare'}
                    </Badge>
                  </Button>
                ))}
              </div>

              {selectedUnconfigured && (
                <div className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Configurazione {selectedUnconfigured.name}
                  </p>
                  <p className="mt-1">
                    Imposta le variabili{' '}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                      {selectedUnconfigured.envHint}
                    </code>{' '}
                    in <code>frontend/.env</code> e riavvia il server per
                    attivare questo provider SSO via Better Auth.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
