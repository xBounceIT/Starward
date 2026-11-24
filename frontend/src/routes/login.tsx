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
import { t } from '@/lib/i18n'

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
        toast.error(res.error.message || t('login.credenziali-non-valide'))
        return
      }
      toast.success(t('login.accesso-effettuato'))
      await navigate({ to: '/vault' })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('login.errore-durante-il-login'),
      )
    } finally {
      setLoading(false)
    }
  }

  const handleLocalRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast.error(t('login.la-password-deve-contenere-almeno-8-caratteri'))
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
          res.error.message || t('login.impossibile-completare-la-registrazione'),
        )
        return
      }
      toast.success(t('login.account-creato-con-successo'))
      await navigate({ to: '/vault' })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('login.errore-durante-la-registrazione'),
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
        err instanceof Error ? err.message : t('login.errore-avvio-flusso-sso'),
      )
      setSsoLoadingId(null)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-6 sync-security:bg-[#000c20] sync-security:bg-[radial-gradient(ellipse_at_top,rgba(26,44,75,0.45),#000c20_65%)] md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2.5 self-center font-medium">
          <div className="flex items-center justify-center bg-primary text-primary-foreground size-8 rounded-full sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b]">
            <ShieldCheck className="size-4.5" />
          </div>
          <span className="font-sans text-lg font-semibold tracking-normal">
            {t('login.starward')}</span>
        </div>

        <Card className="sync-security:border-white/20 border-t-2 sync-security:border-t-[#ff9c00]">
          <CardHeader className="text-center">
            <CardTitle className="text-lg sync-security:text-[#ff9c00]">
              {t('login.accedi-al-tuo-vault')}</CardTitle>
            <CardDescription>
              {ssoProviders.length > 0
                ? t('login.accedi-con-le-tue-credenziali-o-tramite-sso')
                : t('login.inserisci-le-tue-credenziali-per-accedere-al-vau')}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Tabs
              value={mode}
              onValueChange={(v) => setMode(v as 'login' | 'register')}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">{t('login.accedi')}</TabsTrigger>
                <TabsTrigger value="register">{t('login.registrati')}</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-4">
                <form onSubmit={handleLocalLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t('login.email')}</Label>
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
                    <Label htmlFor="login-password">{t('login.password')}</Label>
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
                    {loading ? t('login.accesso-in-corso') : t('login.accedi')}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-4">
                <form onSubmit={handleLocalRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-name">{t('login.nome-completo')}</Label>
                    <Input
                      id="reg-name"
                      placeholder={t('login.mario-rossi')}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">{t('login.email')}</Label>
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
                      {t('login.password-min-8-caratteri')}</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      placeholder={t('login.crea-una-password-sicura')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? t('login.creazione-account') : t('login.crea-account')}
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
                      {t('login.oppure-continua-con')}</span>
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
