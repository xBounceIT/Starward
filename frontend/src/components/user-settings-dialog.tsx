import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  FolderLock,
  KeyRound,
  Laptop,
  Lock,
  Moon,
  Plus,
  RefreshCw,
  Settings2,
  Shield,
  Sparkles,
  Sun,
  Terminal,
  Trash2,
  User as UserIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VaultIcon } from '@/components/vault-icon'
import {
  vaultApi,
  type ApiKeyItem,
  type ApiKeyPermission,
  type CreatedApiKey,
  type UserSettings,
  type UserSummary,
  type Vault,
} from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { useTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import {
  evaluatePasswordStrength,
  formatRelativeDate,
  formatShortDate,
  generateSecurePassword,
  getInitials,
  getVaultColor,
} from '@/lib/vault-utils'

export type SettingsTab = 'profile' | 'security' | 'preferences' | 'api-keys'

interface UserSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: SettingsTab
  user: { id: string; name: string; email: string; image?: string | null }
  vaults: Vault[]
  settings: UserSettings | null
  onUserUpdated: (updated: UserSummary) => void
  onSettingsUpdated: (updated: UserSettings) => void
}

interface SessionItem {
  id: string
  token: string
  userAgent?: string | null
  ipAddress?: string | null
  createdAt?: string | Date
  expiresAt?: string | Date
}

const AUTO_DEFAULT_VAULT = '__auto__'

function formatUserAgent(ua?: string | null): string {
  if (!ua) return 'Dispositivo web'
  const lower = ua.toLowerCase()
  let browser = 'Browser'
  if (lower.includes('edg/')) browser = 'Edge'
  else if (lower.includes('chrome/')) browser = 'Chrome'
  else if (lower.includes('firefox/')) browser = 'Firefox'
  else if (lower.includes('safari/')) browser = 'Safari'
  else if (lower.includes('curl')) browser = 'cURL CLI'

  let os = ''
  if (lower.includes('windows')) os = 'Windows'
  else if (lower.includes('mac os') || lower.includes('macintosh')) os = 'macOS'
  else if (lower.includes('android')) os = 'Android'
  else if (lower.includes('iphone') || lower.includes('ipad')) os = 'iOS'
  else if (lower.includes('linux')) os = 'Linux'

  return os ? `${browser} su ${os}` : browser
}

export function UserSettingsDialog({
  open,
  onOpenChange,
  initialTab = 'profile',
  user,
  vaults,
  settings,
  onUserUpdated,
  onSettingsUpdated,
}: UserSettingsDialogProps) {
  const { theme, setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)

  // Profile tab state
  const [displayName, setDisplayName] = useState(user.name)
  const [savingProfile, setSavingProfile] = useState(false)
  const [copiedUserId, setCopiedUserId] = useState(false)

  // Security tab state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [revokeOthersOnPwChange, setRevokeOthersOnPwChange] = useState(true)
  const [changingPassword, setChangingPassword] = useState(false)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [currentSessionToken, setCurrentSessionToken] = useState<string | null>(
    null,
  )
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [revokingToken, setRevokingToken] = useState<string | null>(null)

  // Preferences tab state
  const [prefTheme, setPrefTheme] = useState<Theme>(
    settings?.theme ?? theme,
  )
  const [prefDefaultVaultId, setPrefDefaultVaultId] = useState<string>(
    settings?.default_vault_id || AUTO_DEFAULT_VAULT,
  )
  const [prefLength, setPrefLength] = useState<number>(
    settings?.password_generator_length ?? 20,
  )
  const [prefUpper, setPrefUpper] = useState<boolean>(
    settings?.password_generator_uppercase ?? true,
  )
  const [prefLower, setPrefLower] = useState<boolean>(
    settings?.password_generator_lowercase ?? true,
  )
  const [prefNumbers, setPrefNumbers] = useState<boolean>(
    settings?.password_generator_numbers ?? true,
  )
  const [prefSymbols, setPrefSymbols] = useState<boolean>(
    settings?.password_generator_symbols ?? true,
  )
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [previewSeed, setPreviewSeed] = useState(0)

  // API Keys tab state
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([])
  const [loadingApiKeys, setLoadingApiKeys] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyPermission, setNewKeyPermission] =
    useState<ApiKeyPermission>('read')
  const [newKeyExpiry, setNewKeyExpiry] = useState<string>('90')
  const [newKeyScopeMode, setNewKeyScopeMode] = useState<'all' | 'selected'>(
    'all',
  )
  const [newKeyVaultIds, setNewKeyVaultIds] = useState<string[]>([])
  const [creatingKey, setCreatingKey] = useState(false)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<CreatedApiKey | null>(
    null,
  )
  const [copiedSecretKey, setCopiedSecretKey] = useState(false)
  const [copiedCurl, setCopiedCurl] = useState(false)
  const [pendingRevokeKey, setPendingRevokeKey] = useState<ApiKeyItem | null>(
    null,
  )

  const writableVaults = useMemo(
    () => vaults.filter((v) => v.role === 'owner' || v.role === 'editor'),
    [vaults],
  )

  const vaultMap = useMemo(() => {
    const map = new Map<string, Vault>()
    for (const v of vaults) {
      map.set(v.id, v)
    }
    return map
  }, [vaults])

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab)
      setDisplayName(user.name)
      setPrefTheme(settings?.theme ?? theme)
      setPrefDefaultVaultId(settings?.default_vault_id || AUTO_DEFAULT_VAULT)
      setPrefLength(settings?.password_generator_length ?? 20)
      setPrefUpper(settings?.password_generator_uppercase ?? true)
      setPrefLower(settings?.password_generator_lowercase ?? true)
      setPrefNumbers(settings?.password_generator_numbers ?? true)
      setPrefSymbols(settings?.password_generator_symbols ?? true)
    } else {
      setNewlyCreatedKey(null)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }, [open, initialTab, user.name, settings, theme])

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const [listRes, currentRes] = await Promise.all([
        authClient.listSessions(),
        authClient.getSession(),
      ])
      if (Array.isArray(listRes.data)) {
        setSessions(listRes.data as SessionItem[])
      }
      const token = currentRes.data?.session?.token ?? null
      setCurrentSessionToken(token)
    } catch {
      // ignore session load errors
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  const loadApiKeys = useCallback(async () => {
    setLoadingApiKeys(true)
    try {
      const list = await vaultApi.listApiKeys()
      setApiKeys(list)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore nel caricamento delle API Key',
      )
    } finally {
      setLoadingApiKeys(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (activeTab === 'security') {
      loadSessions()
    } else if (activeTab === 'api-keys') {
      loadApiKeys()
    }
  }, [open, activeTab, loadSessions, loadApiKeys])

  const previewPassword = useMemo(() => {
    void previewSeed
    return generateSecurePassword({
      length: prefLength,
      uppercase: prefUpper,
      lowercase: prefLower,
      numbers: prefNumbers,
      symbols: prefSymbols,
    })
  }, [prefLength, prefUpper, prefLower, prefNumbers, prefSymbols, previewSeed])

  const newPwStrength = evaluatePasswordStrength(newPassword)

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = displayName.trim()
    if (!cleanName) {
      toast.error('Inserisci un nome visualizzato valido')
      return
    }

    setSavingProfile(true)
    try {
      const updated = await vaultApi.updateProfile({ name: cleanName })
      try {
        await authClient.updateUser({ name: cleanName })
      } catch {
        // Better Auth update is best-effort alongside Rust vault record
      }
      onUserUpdated(updated)
      toast.success('Profilo aggiornato con successo')
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore durante il salvataggio del profilo',
      )
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPassword) {
      toast.error('Inserisci la password attuale')
      return
    }
    if (newPassword.length < 8) {
      toast.error('La nuova password deve avere almeno 8 caratteri')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('La conferma della nuova password non coincide')
      return
    }

    setChangingPassword(true)
    try {
      const res = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: revokeOthersOnPwChange,
      })
      if (res.error) {
        toast.error(
          res.error.message ||
            'Impossibile aggiornare la password. Verifica la password attuale.',
        )
        return
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Password aggiornata con successo')
      if (revokeOthersOnPwChange) {
        await loadSessions()
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore durante il cambio password',
      )
    } finally {
      setChangingPassword(false)
    }
  }

  const handleRevokeSession = async (token: string) => {
    setRevokingToken(token)
    try {
      await authClient.revokeSession({ token })
      setSessions((prev) => prev.filter((s) => s.token !== token))
      toast.success('Sessione disconnessa')
    } catch {
      toast.error('Errore durante la revoca della sessione')
    } finally {
      setRevokingToken(null)
    }
  }

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prefUpper && !prefLower && !prefNumbers && !prefSymbols) {
      toast.error(
        'Seleziona almeno un set di caratteri per il generatore password',
      )
      return
    }

    setSavingPrefs(true)
    try {
      const updated = await vaultApi.updateSettings({
        theme: prefTheme,
        password_generator_length: prefLength,
        password_generator_uppercase: prefUpper,
        password_generator_lowercase: prefLower,
        password_generator_numbers: prefNumbers,
        password_generator_symbols: prefSymbols,
        default_vault_id:
          prefDefaultVaultId === AUTO_DEFAULT_VAULT ? '' : prefDefaultVaultId,
      })
      setTheme(updated.theme)
      onSettingsUpdated(updated)
      toast.success('Preferenze salvate')
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore nel salvataggio delle preferenze',
      )
    } finally {
      setSavingPrefs(false)
    }
  }

  const toggleSelectedVault = (vaultId: string) => {
    setNewKeyVaultIds((prev) =>
      prev.includes(vaultId)
        ? prev.filter((id) => id !== vaultId)
        : [...prev, vaultId],
    )
  }

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = newKeyName.trim()
    if (!cleanName) {
      toast.error('Inserisci un nome identificativo per la API Key')
      return
    }
    if (newKeyScopeMode === 'selected' && newKeyVaultIds.length === 0) {
      toast.error(
        'Seleziona almeno una cartella o scegli "Tutte le cartelle"',
      )
      return
    }

    setCreatingKey(true)
    try {
      const expiresInDays =
        newKeyExpiry === 'never' ? null : Number.parseInt(newKeyExpiry, 10)
      const created = await vaultApi.createApiKey({
        name: cleanName,
        permission: newKeyPermission,
        vault_ids: newKeyScopeMode === 'selected' ? newKeyVaultIds : [],
        expires_in_days: expiresInDays,
      })
      setNewlyCreatedKey(created)
      setApiKeys((prev) => [created.api_key, ...prev])
      setNewKeyName('')
      setNewKeyVaultIds([])
      setNewKeyScopeMode('all')
      toast.success(`API Key "${created.api_key.name}" generata`)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore nella generazione della API Key',
      )
    } finally {
      setCreatingKey(false)
    }
  }

  const confirmRevokeApiKey = async () => {
    if (!pendingRevokeKey) return
    const target = pendingRevokeKey
    setPendingRevokeKey(null)
    try {
      await vaultApi.deleteApiKey(target.id)
      setApiKeys((prev) => prev.filter((k) => k.id !== target.id))
      if (newlyCreatedKey?.api_key.id === target.id) {
        setNewlyCreatedKey(null)
      }
      toast.success(`API Key "${target.name}" revocata`)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore durante la revoca della API Key',
      )
    }
  }

  const copyText = async (
    text: string,
    label: string,
    onFlag?: (v: boolean) => void,
  ) => {
    try {
      await navigator.clipboard.writeText(text)
      onFlag?.(true)
      setTimeout(() => onFlag?.(false), 2000)
      toast.success(`${label} copiato negli appunti`)
    } catch {
      toast.error('Impossibile copiare negli appunti')
    }
  }

  const apiOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000'
  const sampleKey = newlyCreatedKey?.secret_key ?? 'sw_live_la_tua_api_key'
  const curlExample = `curl -s -H "Authorization: Bearer ${sampleKey}" "${apiOrigin}/api/v1/credentials"`

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="size-5 text-primary" />
              Impostazioni Utente & API Key
            </DialogTitle>
            <DialogDescription>
              Gestisci il tuo profilo, la sicurezza dell'account, le preferenze
              del vault e le API Key personali per l'accesso programmatico.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as SettingsTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="profile" className="gap-1.5 text-xs sm:text-sm">
                <UserIcon className="size-3.5" />
                <span>Profilo</span>
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-1.5 text-xs sm:text-sm">
                <Shield className="size-3.5" />
                <span>Sicurezza</span>
              </TabsTrigger>
              <TabsTrigger
                value="preferences"
                className="gap-1.5 text-xs sm:text-sm"
              >
                <Sparkles className="size-3.5" />
                <span>Preferenze</span>
              </TabsTrigger>
              <TabsTrigger value="api-keys" className="gap-1.5 text-xs sm:text-sm">
                <KeyRound className="size-3.5" />
                <span>API Key</span>
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 flex-1 overflow-y-auto pr-1">
              {/* TAB 1: PROFILE */}
              <TabsContent value="profile" className="mt-0 space-y-5">
                <div className="flex flex-col gap-4 rounded-xl border bg-muted/25 p-4 sm:flex-row sm:items-center">
                  <Avatar className="size-14 border border-border/80">
                    <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
                      {getInitials(displayName || user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold">
                        {user.name}
                      </h3>
                      <Badge variant="secondary" className="text-[11px]">
                        Account Attivo
                      </Badge>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {user.email}
                    </p>
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        ID: {user.id}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          copyText(user.id, 'ID Utente', setCopiedUserId)
                        }
                        title="Copia ID utente"
                      >
                        {copiedUserId ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="settings-display-name">
                      Nome visualizzato
                    </Label>
                    <Input
                      id="settings-display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Il tuo nome o nickname"
                      maxLength={80}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Questo nome è visibile ai membri con cui condividi le
                      cartelle e nei registri attività (Audit Log).
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="settings-email">Indirizzo Email</Label>
                    <Input
                      id="settings-email"
                      value={user.email}
                      disabled
                      className="bg-muted/50 text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">
                      L'email viene utilizzata per il login e per gli inviti
                      alle cartelle condivise.
                    </p>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={savingProfile}>
                      {savingProfile ? 'Salvataggio...' : 'Salva profilo'}
                    </Button>
                  </div>
                </form>
              </TabsContent>

              {/* TAB 2: SECURITY */}
              <TabsContent value="security" className="mt-0 space-y-6">
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Lock className="size-4 text-primary" />
                      Cambio Password
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Aggiorna la password del tuo account locale Starward.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="current-password">Password attuale</Label>
                    <div className="relative">
                      <Input
                        id="current-password"
                        type={showCurrentPw ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Inserisci la password attuale"
                        className="pr-10"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setShowCurrentPw((v) => !v)}
                        className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
                        tabIndex={-1}
                      >
                        {showCurrentPw ? (
                          <EyeOff className="size-3.5" />
                        ) : (
                          <Eye className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-password">Nuova password</Label>
                      <div className="relative">
                        <Input
                          id="new-password"
                          type={showNewPw ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Minimo 8 caratteri"
                          className="pr-10"
                          required
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setShowNewPw((v) => !v)}
                          className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
                          tabIndex={-1}
                        >
                          {showNewPw ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-password">
                        Conferma nuova password
                      </Label>
                      <Input
                        id="confirm-password"
                        type={showNewPw ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ripeti la nuova password"
                        required
                      />
                    </div>
                  </div>

                  {newPassword && (
                    <div className="flex items-center gap-2">
                      <Progress
                        value={newPwStrength.percent}
                        className="h-1.5 flex-1"
                      />
                      <span className="text-xs font-medium text-muted-foreground">
                        Robustezza: {newPwStrength.label}
                      </span>
                    </div>
                  )}

                  <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs">
                    <span>
                      Disconnetti automaticamente tutte le altre sessioni attive
                    </span>
                    <Switch
                      checked={revokeOthersOnPwChange}
                      onCheckedChange={setRevokeOthersOnPwChange}
                    />
                  </label>

                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={changingPassword}>
                      {changingPassword
                        ? 'Aggiornamento...'
                        : 'Aggiorna password'}
                    </Button>
                  </div>
                </form>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <Laptop className="size-4 text-primary" />
                        Sessioni Attive
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Dispositivi e browser attualmente collegati al tuo
                        account.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={loadSessions}
                      disabled={loadingSessions}
                    >
                      <RefreshCw
                        className={cn(
                          'size-3',
                          loadingSessions && 'animate-spin',
                        )}
                      />
                      Aggiorna
                    </Button>
                  </div>

                  {sessions.length === 0 ? (
                    <p className="rounded-lg border bg-muted/20 py-4 text-center text-xs text-muted-foreground">
                      {loadingSessions
                        ? 'Caricamento sessioni...'
                        : 'Sessione corrente attiva.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {sessions.map((s) => {
                        const isCurrent = s.token === currentSessionToken
                        return (
                          <div
                            key={s.id || s.token}
                            className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-xs"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-medium text-foreground">
                                  {formatUserAgent(s.userAgent)}
                                </span>
                                {isCurrent && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    Sessione corrente
                                  </Badge>
                                )}
                              </div>
                              <p className="text-muted-foreground">
                                {s.ipAddress ? `IP: ${s.ipAddress} · ` : ''}
                                {s.createdAt
                                  ? `Avviata ${formatRelativeDate(String(s.createdAt))}`
                                  : 'Attiva'}
                              </p>
                            </div>
                            {!isCurrent && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                className="text-destructive hover:text-destructive"
                                disabled={revokingToken === s.token}
                                onClick={() => handleRevokeSession(s.token)}
                              >
                                Disconnetti
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* TAB 3: PREFERENCES */}
              <TabsContent value="preferences" className="mt-0">
                <form onSubmit={handleSavePreferences} className="space-y-5">
                  <div className="space-y-2">
                    <Label>Tema Interfaccia</Label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => {
                          setPrefTheme('dark')
                          setTheme('dark')
                        }}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-md border p-3 text-left text-sm transition-colors',
                          prefTheme === 'dark'
                            ? 'border-primary bg-primary/10 font-medium text-foreground'
                            : 'hover:bg-muted/50 text-muted-foreground',
                        )}
                      >
                        <Moon className="size-4 shrink-0 text-foreground" />
                        <div>
                          <div>Tema Scuro</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            Bassa luminosità
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPrefTheme('light')
                          setTheme('light')
                        }}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-md border p-3 text-left text-sm transition-colors',
                          prefTheme === 'light'
                            ? 'border-primary bg-primary/10 font-medium text-foreground'
                            : 'hover:bg-muted/50 text-muted-foreground',
                        )}
                      >
                        <Sun className="size-4 shrink-0 text-amber-500" />
                        <div>
                          <div>Tema Chiaro</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            Contrasto elevato
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPrefTheme('sync-security')
                          setTheme('sync-security')
                        }}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 border p-3 text-left text-sm transition-colors rounded-md',
                          prefTheme === 'sync-security'
                            ? 'border-primary bg-primary/10 font-medium text-foreground sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00]/15'
                            : 'hover:bg-muted/50 text-muted-foreground',
                        )}
                      >
                        <span
                          className="flex size-5 shrink-0 items-center justify-center rounded-full border border-[#ff9c00] bg-[#000c20] shadow-[inset_0_0_0_2px_#0e1b33]"
                          aria-hidden="true"
                        >
                          <span className="size-2 rounded-full bg-[#ff9c00]" />
                        </span>
                        <div>
                          <div>Sync Security</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            Stile syncsecurity.it
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pref-default-vault">
                      Cartella predefinita per nuove credenziali
                    </Label>
                    <Select
                      value={prefDefaultVaultId}
                      onValueChange={setPrefDefaultVaultId}
                    >
                      <SelectTrigger id="pref-default-vault" className="w-full">
                        <SelectValue placeholder="Seleziona cartella predefinita" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AUTO_DEFAULT_VAULT}>
                          Automatica (cartella attualmente aperta)
                        </SelectItem>
                        {writableVaults.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                            {v.is_personal ? ' (Personale)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Usata quando premi "Nuova credenziale" dalla vista
                      generale o dai Preferiti.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold">
                        Valori predefiniti Generatore Password
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Personalizza lunghezza e set di caratteri predefiniti
                        quando generi nuove password o secret.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <Label htmlFor="pref-pw-len">
                          Lunghezza predefinita
                        </Label>
                        <span className="font-mono text-sm font-semibold">
                          {prefLength} caratteri
                        </span>
                      </div>
                      <Slider
                        id="pref-pw-len"
                        min={8}
                        max={64}
                        step={1}
                        value={[prefLength]}
                        onValueChange={([len]) => setPrefLength(len)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2">
                        <span>Lettere maiuscole (A-Z)</span>
                        <Switch
                          checked={prefUpper}
                          onCheckedChange={setPrefUpper}
                        />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2">
                        <span>Lettere minuscole (a-z)</span>
                        <Switch
                          checked={prefLower}
                          onCheckedChange={setPrefLower}
                        />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2">
                        <span>Numeri (0-9)</span>
                        <Switch
                          checked={prefNumbers}
                          onCheckedChange={setPrefNumbers}
                        />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2">
                        <span>Simboli (!@#$)</span>
                        <Switch
                          checked={prefSymbols}
                          onCheckedChange={setPrefSymbols}
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                      <div className="min-w-0">
                        <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Anteprima password generata
                        </span>
                        <span className="block truncate font-mono text-xs">
                          {previewPassword}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setPreviewSeed((s) => s + 1)}
                        title="Rigenera anteprima"
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={savingPrefs}>
                      {savingPrefs ? 'Salvataggio...' : 'Salva preferenze'}
                    </Button>
                  </div>
                </form>
              </TabsContent>

              {/* TAB 4: API KEYS */}
              <TabsContent value="api-keys" className="mt-0 space-y-5">
                {newlyCreatedKey && (
                  <div className="space-y-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        <AlertTriangle className="size-4 shrink-0" />
                        <span>
                          Copia subito la tua nuova API Key "{newlyCreatedKey.api_key.name}"
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setNewlyCreatedKey(null)}
                      >
                        Chiudi
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Per motivi di sicurezza il token completo viene mostrato{' '}
                      <strong className="text-foreground">
                        una sola volta
                      </strong>{' '}
                      ed è salvato sul server esclusivamente come hash SHA-256.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-lg border bg-background px-3 py-2 font-mono text-xs break-all select-all">
                        {newlyCreatedKey.secret_key}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          copyText(
                            newlyCreatedKey.secret_key,
                            'API Key',
                            setCopiedSecretKey,
                          )
                        }
                      >
                        {copiedSecretKey ? (
                          <>
                            <Check className="size-3.5" />
                            Copiata
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            Copia
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                <form
                  onSubmit={handleCreateApiKey}
                  className="space-y-3.5 rounded-xl border bg-muted/20 p-3.5"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Plus className="size-4 text-primary" />
                    Genera nuova API Key
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-1">
                      <Label htmlFor="api-key-name" className="text-xs">
                        Nome identificativo
                      </Label>
                      <Input
                        id="api-key-name"
                        placeholder="es. CI/CD GitHub, CLI..."
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        maxLength={80}
                        required
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-1">
                      <Label htmlFor="api-key-perm" className="text-xs">
                        Permessi
                      </Label>
                      <Select
                        value={newKeyPermission}
                        onValueChange={(v) =>
                          setNewKeyPermission(v as ApiKeyPermission)
                        }
                      >
                        <SelectTrigger id="api-key-perm" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">
                            Sola lettura (Read)
                          </SelectItem>
                          <SelectItem value="read_write">
                            Lettura e scrittura
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5 sm:col-span-1">
                      <Label htmlFor="api-key-exp" className="text-xs">
                        Scadenza
                      </Label>
                      <Select
                        value={newKeyExpiry}
                        onValueChange={setNewKeyExpiry}
                      >
                        <SelectTrigger id="api-key-exp" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 giorni</SelectItem>
                          <SelectItem value="90">90 giorni</SelectItem>
                          <SelectItem value="365">1 anno</SelectItem>
                          <SelectItem value="never">
                            Nessuna scadenza
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">
                        Ambito cartelle (Scope)
                      </Label>
                      <div className="flex items-center gap-1 rounded-lg border bg-background p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setNewKeyScopeMode('all')}
                          className={cn(
                            'cursor-pointer rounded-md px-2.5 py-1 transition-colors',
                            newKeyScopeMode === 'all'
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          Tutte le cartelle
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewKeyScopeMode('selected')}
                          className={cn(
                            'cursor-pointer rounded-md px-2.5 py-1 transition-colors',
                            newKeyScopeMode === 'selected'
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          Cartelle specifiche
                        </button>
                      </div>
                    </div>

                    {newKeyScopeMode === 'selected' && (
                      <div className="flex flex-wrap gap-1.5 rounded-lg border bg-background p-2.5">
                        {vaults.map((v) => {
                          const selected = newKeyVaultIds.includes(v.id)
                          const palette = getVaultColor(v.color)
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => toggleSelectedVault(v.id)}
                              className={cn(
                                'flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                                selected
                                  ? 'border-primary bg-primary/10 font-medium text-foreground'
                                  : 'text-muted-foreground hover:bg-muted',
                              )}
                            >
                              <VaultIcon
                                icon={v.icon}
                                className={cn('size-3.5', palette.text)}
                              />
                              <span>{v.name}</span>
                              {selected && (
                                <Check className="size-3 text-primary" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={creatingKey}>
                      <KeyRound className="size-3.5" />
                      {creatingKey ? 'Generazione...' : 'Genera API Key'}
                    </Button>
                  </div>
                </form>

                {/* API KEYS LIST */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Le tue API Key ({apiKeys.length})
                    </h4>
                  </div>

                  {loadingApiKeys ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      Caricamento API Key...
                    </p>
                  ) : apiKeys.length === 0 ? (
                    <div className="rounded-xl border border-dashed py-8 text-center">
                      <KeyRound className="mx-auto size-7 text-muted-foreground/60" />
                      <p className="mt-2 text-sm font-medium">
                        Nessuna API Key attiva
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Genera una chiave sopra per accedere alle API REST di
                        Starward da script, CLI o pipeline CI/CD.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {apiKeys.map((key) => {
                        const scopedNames = key.vault_ids
                          .map((id) => vaultMap.get(id)?.name ?? id.slice(0, 8))
                          .filter(Boolean)

                        return (
                          <div
                            key={key.id}
                            className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center"
                          >
                            <div className="min-w-0 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-semibold">
                                  {key.name}
                                </span>
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                  {key.key_prefix}••••••••
                                </code>
                                <Badge
                                  variant={
                                    key.permission === 'read_write'
                                      ? 'default'
                                      : 'secondary'
                                  }
                                  className="text-[10px]"
                                >
                                  {key.permission === 'read_write'
                                    ? 'Lettura & Scrittura'
                                    : 'Sola lettura'}
                                </Badge>
                                {key.is_expired && (
                                  <Badge
                                    variant="destructive"
                                    className="text-[10px]"
                                  >
                                    Scaduta
                                  </Badge>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <FolderLock className="size-3" />
                                  {scopedNames.length === 0
                                    ? 'Tutte le cartelle'
                                    : `Cartelle: ${scopedNames.join(', ')}`}
                                </span>
                                <span>
                                  Creata il {formatShortDate(key.created_at)}
                                </span>
                                <span>
                                  {key.expires_at
                                    ? `Scadenza: ${formatShortDate(key.expires_at)}`
                                    : 'Nessuna scadenza'}
                                </span>
                                <span>
                                  {key.last_used_at
                                    ? `Ultimo uso: ${formatRelativeDate(key.last_used_at)}`
                                    : 'Mai utilizzata'}
                                </span>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setPendingRevokeKey(key)}
                              >
                                <Trash2 className="size-3.5" />
                                Revoca
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* QUICK USAGE SNIPPET */}
                <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <Terminal className="size-3.5 text-primary" />
                      Esempio utilizzo API REST
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        copyText(curlExample, 'Comando cURL', setCopiedCurl)
                      }
                    >
                      {copiedCurl ? (
                        <>
                          <Check className="size-3 text-emerald-500" />
                          Copiato
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          Copia cURL
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Puoi autenticare qualsiasi chiamata a{' '}
                    <code className="font-mono">/api/v1/vaults</code> o{' '}
                    <code className="font-mono">/api/v1/credentials</code>{' '}
                    passando l'header{' '}
                    <code className="font-mono">
                      Authorization: Bearer sw_live_...
                    </code>{' '}
                    oppure <code className="font-mono">X-API-Key</code>:
                  </p>
                  <pre className="overflow-x-auto rounded-lg border bg-background p-2.5 font-mono text-[11px] leading-relaxed">
                    {curlExample}
                  </pre>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* REVOKE API KEY CONFIRMATION */}
      <AlertDialog
        open={Boolean(pendingRevokeKey)}
        onOpenChange={(openState) => {
          if (!openState) setPendingRevokeKey(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocare questa API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              La chiave{' '}
              <strong className="text-foreground">
                "{pendingRevokeKey?.name}"
              </strong>{' '}
              (<code className="font-mono">{pendingRevokeKey?.key_prefix}</code>
              ) verrà disattivata immediatamente. Qualsiasi script o
              integrazione che la utilizza perderà l'accesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmRevokeApiKey}
            >
              Revoca definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
