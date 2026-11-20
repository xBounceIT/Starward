import { useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Building2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
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
import type { PublicSsoProvider } from '@/lib/sso-config'

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
        toast.error(
          res.error.message || 'Impossibile completare la registrazione',
        )
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

  const handleSsoClick = async (provider: PublicSsoProvider) => {
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
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" />
          </div>
          <span className="font-semibold tracking-tight">Starward</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Accedi al tuo Vault</CardTitle>
            <CardDescription>
              {ssoProviders.length > 0
                ? 'Accedi con le tue credenziali o tramite SSO.'
                : 'Inserisci le tue credenziali per accedere al vault.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Tabs
              value={mode}
              onValueChange={(v) => setMode(v as 'login' | 'register')}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Accedi</TabsTrigger>
                <TabsTrigger value="register">Registrati</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-4">
                <form onSubmit={handleLocalLogin} className="space-y-4">
                  <div className="space-y-2">
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
                  <div className="space-y-2">
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
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Accesso in corso...' : 'Accedi'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-4">
                <form onSubmit={handleLocalRegister} className="space-y-4">
                  <div className="space-y-2">
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
                  <div className="space-y-2">
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
                  <div className="space-y-2">
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
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Creazione account...' : 'Crea account'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            {ssoProviders.length > 0 && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      Oppure continua con
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {ssoProviders.map((provider) => (
                    <Button
                      key={provider.id}
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={ssoLoadingId === provider.id}
                      onClick={() => handleSsoClick(provider)}
                    >
                      <Building2 className="size-4" />
                      {ssoLoadingId === provider.id
                        ? 'Reindirizzamento...'
                        : provider.name}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
