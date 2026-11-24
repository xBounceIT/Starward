import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  Plug,
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
import { getVaultDisplayIcon, VaultIcon } from '@/components/vault-icon'
import {
  vaultApi,
  type ApiKeyItem,
  type ApiKeyPermission,
  type CreatedApiKey,
  type CreatedMcpKey,
  type McpKeyItem,
  type UserSettings,
  type UserSummary,
  type Vault,
} from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { useTheme } from '@/lib/theme'
import { cn, copyToClipboard } from '@/lib/utils'
import {
  evaluatePasswordStrength,
  formatRelativeDate,
  formatShortDate,
  generateSecurePassword,
  getInitials,
  getVaultColor,
} from '@/lib/vault-utils'
import {
  getLanguagePreference,
  setLanguagePreference,
  t,
  type LanguagePreference,
} from '@/lib/i18n'

export type SettingsTab =
  | 'profile'
  | 'security'
  | 'preferences'
  | 'api-keys'
  | 'mcp'

type McpSnippetClient = 'json' | 'claude-code' | 'vscode'

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
  if (!ua) return t('user-settings-dialog.dispositivo-web')
  const lower = ua.toLowerCase()
  let browser = t('user-settings-dialog.browser')
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

function getMcpSnippet(
  client: McpSnippetClient,
  endpoint: string,
  token: string,
): string {
  switch (client) {
    case 'claude-code':
      return `claude mcp add --transport http starward "${endpoint}" --header "Authorization: Bearer ${token}"`
    case 'vscode':
      return JSON.stringify(
        {
          servers: {
            starward: {
              type: 'http',
              url: endpoint,
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          },
        },
        null,
        2,
      )
    case 'json':
    default:
      return JSON.stringify(
        {
          mcpServers: {
            starward: {
              type: 'http',
              url: endpoint,
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          },
        },
        null,
        2,
      )
  }
}

function VaultScopeSelector({
  scopeMode,
  onScopeModeChange,
  selectedVaultIds,
  onToggleVault,
  vaults,
}: {
  scopeMode: 'all' | 'selected'
  onScopeModeChange: (mode: 'all' | 'selected') => void
  selectedVaultIds: string[]
  onToggleVault: (vaultId: string) => void
  vaults: Vault[]
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{t('user-settings-dialog.ambito-cartelle-scope')}</Label>
        <div className="flex items-center gap-1 rounded-lg border bg-background p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onScopeModeChange('all')}
            className={cn(
              'cursor-pointer rounded-md px-2.5 py-1 transition-colors',
              scopeMode === 'all'
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('user-settings-dialog.tutte-le-cartelle')}</button>
          <button
            type="button"
            onClick={() => onScopeModeChange('selected')}
            className={cn(
              'cursor-pointer rounded-md px-2.5 py-1 transition-colors',
              scopeMode === 'selected'
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('user-settings-dialog.cartelle-specifiche')}</button>
        </div>
      </div>

      {scopeMode === 'selected' && (
        <div className="flex flex-wrap gap-1.5 rounded-lg border bg-background p-2.5">
          {vaults.map((v) => {
            const selected = selectedVaultIds.includes(v.id)
            const palette = getVaultColor(v.color)
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onToggleVault(v.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                  selected
                    ? 'border-primary bg-primary/10 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <VaultIcon
                  icon={getVaultDisplayIcon(v)}
                  className={cn('size-3.5', palette.text)}
                  style={palette.style}
                />
                <span>{v.name}</span>
                {selected && <Check className="size-3 text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ScopedKeyCard({
  item,
  vaultMap,
  onRevoke,
}: {
  item: ApiKeyItem | McpKeyItem
  vaultMap: Map<string, Vault>
  onRevoke: () => void
}) {
  const scopedNames = item.vault_ids
    .map((id) => vaultMap.get(id)?.name ?? id.slice(0, 8))
    .filter(Boolean)

  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{item.name}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {item.key_prefix}••••••••
          </code>
          <Badge
            variant={item.permission === 'read_write' ? 'default' : 'secondary'}
            className="text-[10px]"
          >
            {item.permission === 'read_write'
              ? t('user-settings-dialog.lettura-scrittura')
              : t('user-settings-dialog.sola-lettura')}
          </Badge>
          {item.is_expired && (
            <Badge variant="destructive" className="text-[10px]">
              {t('user-settings-dialog.scaduta')}</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <FolderLock className="size-3" />
            {scopedNames.length === 0
              ? t('user-settings-dialog.tutte-le-cartelle')
              : t('user-settings-dialog.cartelle-v0', { v0: scopedNames.join(', ') })}
          </span>
          <span>{t('user-settings-dialog.creata-il')} {formatShortDate(item.created_at)}</span>
          <span>
            {item.expires_at
              ? t('user-settings-dialog.scadenza-v0', { v0: formatShortDate(item.expires_at) })
              : t('user-settings-dialog.nessuna-scadenza')}
          </span>
          <span>
            {item.last_used_at
              ? t('user-settings-dialog.ultimo-uso-v0', { v0: formatRelativeDate(item.last_used_at) })
              : t('user-settings-dialog.mai-utilizzata')}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onRevoke}
        >
          <Trash2 className="size-3.5" />
          {t('user-settings-dialog.revoca')}</Button>
      </div>
    </div>
  )
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
  const wasOpenRef = useRef(false)
  const settingsHydratedRef = useRef(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

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
  const [languagePref, setLanguagePrefState] = useState<LanguagePreference>(() =>
    getLanguagePreference(),
  )

  const handleLanguageChange = (pref: LanguagePreference) => {
    setLanguagePrefState(pref)
    setLanguagePreference(pref)
  }

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

  // MCP Keys tab state
  const [mcpKeys, setMcpKeys] = useState<McpKeyItem[]>([])
  const [loadingMcpKeys, setLoadingMcpKeys] = useState(false)
  const [newMcpKeyName, setNewMcpKeyName] = useState('')
  const [newMcpKeyPermission, setNewMcpKeyPermission] =
    useState<ApiKeyPermission>('read')
  const [newMcpKeyExpiry, setNewMcpKeyExpiry] = useState<string>('90')
  const [newMcpKeyScopeMode, setNewMcpKeyScopeMode] = useState<
    'all' | 'selected'
  >('all')
  const [newMcpKeyVaultIds, setNewMcpKeyVaultIds] = useState<string[]>([])
  const [creatingMcpKey, setCreatingMcpKey] = useState(false)
  const [newlyCreatedMcpKey, setNewlyCreatedMcpKey] =
    useState<CreatedMcpKey | null>(null)
  const [copiedMcpSecretKey, setCopiedMcpSecretKey] = useState(false)
  const [copiedMcpEndpoint, setCopiedMcpEndpoint] = useState(false)
  const [copiedMcpConfig, setCopiedMcpConfig] = useState(false)
  const [mcpSnippetClient, setMcpSnippetClient] =
    useState<McpSnippetClient>('json')
  const [pendingRevokeMcpKey, setPendingRevokeMcpKey] =
    useState<McpKeyItem | null>(null)

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
    const justOpened = open && !wasOpenRef.current
    const justClosed = !open && wasOpenRef.current
    wasOpenRef.current = open

    if (justOpened) {
      setActiveTab(initialTab)
      setDisplayName(user.name)
      setPrefDefaultVaultId(settings?.default_vault_id || AUTO_DEFAULT_VAULT)
      setPrefLength(settings?.password_generator_length ?? 20)
      setPrefUpper(settings?.password_generator_uppercase ?? true)
      setPrefLower(settings?.password_generator_lowercase ?? true)
      setPrefNumbers(settings?.password_generator_numbers ?? true)
      setPrefSymbols(settings?.password_generator_symbols ?? true)
      setLanguagePrefState(getLanguagePreference())
      settingsHydratedRef.current = settings !== null
    } else if (justClosed) {
      settingsHydratedRef.current = false
      setNewlyCreatedKey(null)
      setNewlyCreatedMcpKey(null)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }, [open, initialTab, user.name, settings])

  useEffect(() => {
    if (open && settings && !settingsHydratedRef.current) {
      setPrefDefaultVaultId(settings.default_vault_id || AUTO_DEFAULT_VAULT)
      setPrefLength(settings.password_generator_length)
      setPrefUpper(settings.password_generator_uppercase)
      setPrefLower(settings.password_generator_lowercase)
      setPrefNumbers(settings.password_generator_numbers)
      setPrefSymbols(settings.password_generator_symbols)
      settingsHydratedRef.current = true
    }
  }, [open, settings])

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
          : t('user-settings-dialog.errore-nel-caricamento-delle-api-key'),
      )
    } finally {
      setLoadingApiKeys(false)
    }
  }, [])

  const loadMcpKeys = useCallback(async () => {
    setLoadingMcpKeys(true)
    try {
      const list = await vaultApi.listMcpKeys()
      setMcpKeys(list)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('user-settings-dialog.errore-nel-caricamento-delle-chiavi-mcp'),
      )
    } finally {
      setLoadingMcpKeys(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (activeTab === 'security') {
      loadSessions()
    } else if (activeTab === 'api-keys') {
      loadApiKeys()
    } else if (activeTab === 'mcp') {
      loadMcpKeys()
    }
  }, [open, activeTab, loadSessions, loadApiKeys, loadMcpKeys])

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
      toast.error(t('user-settings-dialog.inserisci-un-nome-visualizzato-valido'))
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
      toast.success(t('user-settings-dialog.profilo-aggiornato-con-successo'))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('user-settings-dialog.errore-durante-il-salvataggio-del-profilo'),
      )
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPassword) {
      toast.error(t('user-settings-dialog.inserisci-la-password-attuale'))
      return
    }
    if (newPassword.length < 8) {
      toast.error(t('user-settings-dialog.la-nuova-password-deve-avere-almeno-8-caratteri'))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('user-settings-dialog.la-conferma-della-nuova-password-non-coincide'))
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
            t('user-settings-dialog.impossibile-aggiornare-la-password-verifica-la-p'),
        )
        return
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success(t('user-settings-dialog.password-aggiornata-con-successo'))
      if (revokeOthersOnPwChange) {
        await loadSessions()
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('user-settings-dialog.errore-durante-il-cambio-password'),
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
      toast.success(t('user-settings-dialog.sessione-disconnessa'))
    } catch {
      toast.error(t('user-settings-dialog.errore-durante-la-revoca-della-sessione'))
    } finally {
      setRevokingToken(null)
    }
  }

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prefUpper && !prefLower && !prefNumbers && !prefSymbols) {
      toast.error(
        t('user-settings-dialog.seleziona-almeno-un-set-di-caratteri-per-il-gene'),
      )
      return
    }

    setSavingPrefs(true)
    try {
      const updated = await vaultApi.updateSettings({
        theme,
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
      toast.success(t('user-settings-dialog.preferenze-salvate'))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('user-settings-dialog.errore-nel-salvataggio-delle-preferenze'),
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

  const toggleSelectedMcpVault = (vaultId: string) => {
    setNewMcpKeyVaultIds((prev) =>
      prev.includes(vaultId)
        ? prev.filter((id) => id !== vaultId)
        : [...prev, vaultId],
    )
  }

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = newKeyName.trim()
    if (!cleanName) {
      toast.error(t('user-settings-dialog.inserisci-un-nome-identificativo-per-la-api-key'))
      return
    }
    if (newKeyScopeMode === 'selected' && newKeyVaultIds.length === 0) {
      toast.error(
        t('user-settings-dialog.seleziona-almeno-una-cartella-o-scegli-tutte-le-'),
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
      toast.success(t('user-settings-dialog.api-key-v0-generata', { v0: created.api_key.name }))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('user-settings-dialog.errore-nella-generazione-della-api-key'),
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
      toast.success(t('user-settings-dialog.api-key-v0-revocata', { v0: target.name }))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('user-settings-dialog.errore-durante-la-revoca-della-api-key'),
      )
    }
  }

  const handleCreateMcpKey = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = newMcpKeyName.trim()
    if (!cleanName) {
      toast.error(t('user-settings-dialog.inserisci-un-nome-identificativo-per-la-chiave-m'))
      return
    }
    if (newMcpKeyScopeMode === 'selected' && newMcpKeyVaultIds.length === 0) {
      toast.error(
        t('user-settings-dialog.seleziona-almeno-una-cartella-o-scegli-tutte-le-'),
      )
      return
    }

    setCreatingMcpKey(true)
    try {
      const expiresInDays =
        newMcpKeyExpiry === 'never'
          ? null
          : Number.parseInt(newMcpKeyExpiry, 10)
      const created = await vaultApi.createMcpKey({
        name: cleanName,
        permission: newMcpKeyPermission,
        vault_ids: newMcpKeyScopeMode === 'selected' ? newMcpKeyVaultIds : [],
        expires_in_days: expiresInDays,
      })
      setNewlyCreatedMcpKey(created)
      setMcpKeys((prev) => [created.mcp_key, ...prev])
      setNewMcpKeyName('')
      setNewMcpKeyVaultIds([])
      setNewMcpKeyScopeMode('all')
      toast.success(t('user-settings-dialog.chiave-mcp-v0-generata', { v0: created.mcp_key.name }))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('user-settings-dialog.errore-nella-generazione-della-chiave-mcp'),
      )
    } finally {
      setCreatingMcpKey(false)
    }
  }

  const confirmRevokeMcpKey = async () => {
    if (!pendingRevokeMcpKey) return
    const target = pendingRevokeMcpKey
    setPendingRevokeMcpKey(null)
    try {
      await vaultApi.deleteMcpKey(target.id)
      setMcpKeys((prev) => prev.filter((k) => k.id !== target.id))
      if (newlyCreatedMcpKey?.mcp_key.id === target.id) {
        setNewlyCreatedMcpKey(null)
      }
      toast.success(t('user-settings-dialog.chiave-mcp-v0-revocata', { v0: target.name }))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('user-settings-dialog.errore-durante-la-revoca-della-chiave-mcp'),
      )
    }
  }

  const copyText = async (
    text: string,
    label: string,
    onFlag?: (v: boolean) => void,
  ) => {
    if (await copyToClipboard(text)) {
      onFlag?.(true)
      setTimeout(() => onFlag?.(false), 2000)
      toast.success(`${label} copiato negli appunti`)
    } else {
      toast.error(t('user-settings-dialog.impossibile-copiare-negli-appunti'))
    }
  }

  const apiOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000'
  const sampleKey = newlyCreatedKey?.secret_key ?? 'sw_live_la_tua_api_key'
  const curlExample = `curl -s -H "Authorization: Bearer ${sampleKey}" "${apiOrigin}/api/v1/credentials"`
  const mcpEndpoint = `${apiOrigin}/api/mcp`
  const sampleMcpKey =
    newlyCreatedMcpKey?.secret_key ?? 'sw_mcp_la_tua_chiave_mcp'
  const mcpConfigSnippet = getMcpSnippet(
    mcpSnippetClient,
    mcpEndpoint,
    sampleMcpKey,
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[760px] max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl flex-col overflow-hidden sm:max-w-5xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="size-5 text-primary" />
              {t('user-settings-dialog.impostazioni-utente-api-key-server-mcp')}</DialogTitle>
            <DialogDescription>
              {t('user-settings-dialog.gestisci-il-tuo-profilo-la-sicurezza-dell-accoun')}</DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            orientation="vertical"
            onValueChange={(v) => {
              setActiveTab(v as SettingsTab)
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = 0
              }
            }}
            className="flex min-h-0 min-w-0 flex-1 max-sm:flex-col"
          >
            <TabsList className="grid w-full shrink-0 grid-cols-5 sm:h-full! sm:w-56 sm:grid-cols-1 sm:auto-rows-fr">
              <TabsTrigger
                value="profile"
                className="gap-1 px-1.5 text-[11px] sm:gap-1.5 sm:px-2 sm:text-sm"
              >
                <UserIcon className="size-3.5" />
                <span>{t('user-settings-dialog.profilo')}</span>
              </TabsTrigger>
              <TabsTrigger
                value="security"
                className="gap-1 px-1.5 text-[11px] sm:gap-1.5 sm:px-2 sm:text-sm"
              >
                <Shield className="size-3.5" />
                <span>{t('user-settings-dialog.sicurezza')}</span>
              </TabsTrigger>
              <TabsTrigger
                value="preferences"
                className="gap-1 px-1.5 text-[11px] sm:gap-1.5 sm:px-2 sm:text-sm"
              >
                <Sparkles className="size-3.5" />
                <span>{t('user-settings-dialog.preferenze')}</span>
              </TabsTrigger>
              <TabsTrigger
                value="api-keys"
                className="gap-1 px-1.5 text-[11px] sm:gap-1.5 sm:px-2 sm:text-sm"
              >
                <KeyRound className="size-3.5" />
                <span>{t('user-settings-dialog.api-key')}</span>
              </TabsTrigger>
              <TabsTrigger
                value="mcp"
                className="gap-1 px-1.5 text-[11px] sm:gap-1.5 sm:px-2 sm:text-sm"
              >
                <Plug className="size-3.5" />
                <span>MCP</span>
              </TabsTrigger>
            </TabsList>

            <div className="relative mt-4 min-h-0 min-w-0 flex-1 sm:mt-0">
              <div
                ref={scrollContainerRef}
                className="h-full min-w-0 overflow-y-auto pr-1 pb-1 [scrollbar-gutter:stable] sm:pl-3"
              >
              {/* TAB 1: PROFILE */}
              <TabsContent value="profile" className="mt-0 min-w-0 space-y-5">
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
                        {t('user-settings-dialog.account-attivo')}</Badge>
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
                          copyText(user.id, t('user-settings-dialog.id-utente'), setCopiedUserId)
                        }
                        title={t('user-settings-dialog.copia-id-utente')}
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
                      {t('user-settings-dialog.nome-visualizzato')}</Label>
                    <Input
                      id="settings-display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t('user-settings-dialog.il-tuo-nome-o-nickname')}
                      maxLength={80}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('user-settings-dialog.questo-nome-e-visibile-ai-membri-con-cui-condivi')}</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="settings-email">{t('user-settings-dialog.indirizzo-email')}</Label>
                    <Input
                      id="settings-email"
                      value={user.email}
                      disabled
                      className="bg-muted/50 text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('user-settings-dialog.l-email-viene-utilizzata-per-il-login-e-per-gli-')}</p>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={savingProfile}>
                      {savingProfile ? 'Salvataggio...' : t('user-settings-dialog.salva-profilo')}
                    </Button>
                  </div>
                </form>
              </TabsContent>

              {/* TAB 2: SECURITY */}
              <TabsContent value="security" className="mt-0 min-w-0 space-y-6">
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Lock className="size-4 text-primary" />
                      {t('user-settings-dialog.cambio-password')}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('user-settings-dialog.aggiorna-la-password-del-tuo-account-locale-star')}</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="current-password">{t('user-settings-dialog.password-attuale')}</Label>
                    <div className="relative">
                      <Input
                        id="current-password"
                        type={showCurrentPw ? 'text' : t('user-settings-dialog.password')}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={t('user-settings-dialog.inserisci-la-password-attuale')}
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
                      <Label htmlFor="new-password">{t('user-settings-dialog.nuova-password')}</Label>
                      <div className="relative">
                        <Input
                          id="new-password"
                          type={showNewPw ? 'text' : t('user-settings-dialog.password')}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder={t('user-settings-dialog.minimo-8-caratteri')}
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
                        {t('user-settings-dialog.conferma-nuova-password')}</Label>
                      <Input
                        id="confirm-password"
                        type={showNewPw ? 'text' : t('user-settings-dialog.password')}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('user-settings-dialog.ripeti-la-nuova-password')}
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
                        {t('user-settings-dialog.robustezza-colon')} {newPwStrength.label}
                      </span>
                    </div>
                  )}

                  <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs">
                    <span>
                      {t('user-settings-dialog.disconnetti-automaticamente-tutte-le-altre-sessi')}</span>
                    <Switch
                      checked={revokeOthersOnPwChange}
                      onCheckedChange={setRevokeOthersOnPwChange}
                    />
                  </label>

                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={changingPassword}>
                      {changingPassword
                        ? 'Aggiornamento...'
                        : t('user-settings-dialog.aggiorna-password')}
                    </Button>
                  </div>
                </form>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <Laptop className="size-4 text-primary" />
                        {t('user-settings-dialog.sessioni-attive')}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('user-settings-dialog.dispositivi-e-browser-attualmente-collegati-al-t')}</p>
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
                      {t('user-settings-dialog.aggiorna')}</Button>
                  </div>

                  {sessions.length === 0 ? (
                    <p className="rounded-lg border bg-muted/20 py-4 text-center text-xs text-muted-foreground">
                      {loadingSessions
                        ? t('user-settings-dialog.caricamento-sessioni')
                        : t('user-settings-dialog.sessione-corrente-attiva')}
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
                                    {t('user-settings-dialog.sessione-corrente')}</Badge>
                                )}
                              </div>
                              <p className="text-muted-foreground">
                                {s.ipAddress ? `IP: ${s.ipAddress} · ` : ''}
                                {s.createdAt
                                  ? t('user-settings-dialog.avviata-v0', { v0: formatRelativeDate(String(s.createdAt)) })
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
                                {t('user-settings-dialog.disconnetti')}</Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* TAB 3: PREFERENCES */}
              <TabsContent value="preferences" className="mt-0 min-w-0">
                <form onSubmit={handleSavePreferences} className="space-y-5">
                  <div className="space-y-2">
                    <Label>{t('user-settings-dialog.tema-interfaccia')}</Label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        aria-pressed={theme === 'dark'}
                        onClick={() => setTheme('dark')}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-md border p-3 text-left text-sm transition-colors',
                          theme === 'dark'
                            ? 'border-primary bg-primary/10 font-medium text-foreground'
                            : 'hover:bg-muted/50 text-muted-foreground',
                        )}
                      >
                        <Moon className="size-4 shrink-0 text-foreground" />
                        <div>
                          <div>{t('user-settings-dialog.tema-scuro')}</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {t('user-settings-dialog.bassa-luminosita')}</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        aria-pressed={theme === 'light'}
                        onClick={() => setTheme('light')}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-md border p-3 text-left text-sm transition-colors',
                          theme === 'light'
                            ? 'border-primary bg-primary/10 font-medium text-foreground'
                            : 'hover:bg-muted/50 text-muted-foreground',
                        )}
                      >
                        <Sun className="size-4 shrink-0 text-amber-500" />
                        <div>
                          <div>{t('user-settings-dialog.tema-chiaro')}</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {t('user-settings-dialog.contrasto-elevato')}</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        aria-pressed={theme === 'sync-security'}
                        onClick={() => setTheme('sync-security')}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 border p-3 text-left text-sm transition-colors rounded-md',
                          theme === 'sync-security'
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
                          <div>{t('user-settings-dialog.sync-security')}</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {t('user-settings-dialog.stile-syncsecurity-it')}</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pref-language">{t('common.language')}</Label>
                    <Select
                      value={languagePref}
                      onValueChange={(v) =>
                        handleLanguageChange(v as LanguagePreference)
                      }
                    >
                      <SelectTrigger id="pref-language" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          {t('common.languageAuto')}
                        </SelectItem>
                        <SelectItem value="it">
                          {t('common.languageItalian')}
                        </SelectItem>
                        <SelectItem value="en">
                          {t('common.languageEnglish')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t('common.languageAutoHint')}
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-1.5">
                    <Label htmlFor="pref-default-vault">
                      {t('user-settings-dialog.cartella-predefinita-per-nuove-credenziali')}</Label>
                    <Select
                      value={prefDefaultVaultId}
                      onValueChange={setPrefDefaultVaultId}
                    >
                      <SelectTrigger id="pref-default-vault" className="w-full">
                        <SelectValue placeholder={t('user-settings-dialog.seleziona-cartella-predefinita')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AUTO_DEFAULT_VAULT}>
                          {t('user-settings-dialog.automatica-cartella-attualmente-aperta')}</SelectItem>
                        {writableVaults.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                            {v.is_personal ? t('user-settings-dialog.personale') : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t('user-settings-dialog.usata-quando-premi-nuova-credenziale-dalla-vista')}</p>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold">
                        {t('user-settings-dialog.valori-predefiniti-generatore-password')}</h3>
                      <p className="text-xs text-muted-foreground">
                        {t('user-settings-dialog.personalizza-lunghezza-e-set-di-caratteri-predef')}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <Label htmlFor="pref-pw-len">
                          {t('user-settings-dialog.lunghezza-predefinita')}</Label>
                        <span className="font-mono text-sm font-semibold">
                          {prefLength} {t('user-settings-dialog.caratteri')}</span>
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
                        <span>{t('user-settings-dialog.lettere-maiuscole-a-z')}</span>
                        <Switch
                          checked={prefUpper}
                          onCheckedChange={setPrefUpper}
                        />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2">
                        <span>{t('user-settings-dialog.lettere-minuscole-a-z')}</span>
                        <Switch
                          checked={prefLower}
                          onCheckedChange={setPrefLower}
                        />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2">
                        <span>{t('user-settings-dialog.numeri-0-9')}</span>
                        <Switch
                          checked={prefNumbers}
                          onCheckedChange={setPrefNumbers}
                        />
                      </label>
                      <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2">
                        <span>{t('user-settings-dialog.simboli')}</span>
                        <Switch
                          checked={prefSymbols}
                          onCheckedChange={setPrefSymbols}
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                      <div className="min-w-0">
                        <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {t('user-settings-dialog.anteprima-password-generata')}</span>
                        <span className="block truncate font-mono text-xs">
                          {previewPassword}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setPreviewSeed((s) => s + 1)}
                        title={t('user-settings-dialog.rigenera-anteprima')}
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={savingPrefs}>
                      {savingPrefs ? 'Salvataggio...' : t('user-settings-dialog.salva-preferenze')}
                    </Button>
                  </div>
                </form>
              </TabsContent>

              {/* TAB 4: API KEYS */}
              <TabsContent value="api-keys" className="mt-0 min-w-0 space-y-5">
                {newlyCreatedKey && (
                  <div className="space-y-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        <AlertTriangle className="size-4 shrink-0" />
                        <span>
                          {t('user-settings-dialog.copia-subito-la-tua-nuova-api-key')}{newlyCreatedKey.api_key.name}"
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setNewlyCreatedKey(null)}
                      >
                        {t('user-settings-dialog.chiudi')}</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('user-settings-dialog.per-motivi-di-sicurezza-il-token-completo-viene-')}{' '}
                      <strong className="text-foreground">
                        {t('user-settings-dialog.una-sola-volta')}</strong>{' '}
                      {t('user-settings-dialog.ed-e-salvato-sul-server-esclusivamente-come-hash')}</p>
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
                            t('user-settings-dialog.api-key'),
                            setCopiedSecretKey,
                          )
                        }
                      >
                        {copiedSecretKey ? (
                          <>
                            <Check className="size-3.5" />
                            {t('user-settings-dialog.copiata')}</>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            {t('user-settings-dialog.copia')}</>
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
                    {t('user-settings-dialog.genera-nuova-api-key')}</div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-1">
                      <Label htmlFor="api-key-name" className="text-xs">
                        {t('user-settings-dialog.nome-identificativo')}</Label>
                      <Input
                        id="api-key-name"
                        placeholder={t('user-settings-dialog.es-ci-cd-github-cli')}
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        maxLength={80}
                        required
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-1">
                      <Label htmlFor="api-key-perm" className="text-xs">
                        {t('user-settings-dialog.permessi')}</Label>
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
                            {t('user-settings-dialog.sola-lettura-read')}</SelectItem>
                          <SelectItem value="read_write">
                            {t('user-settings-dialog.lettura-e-scrittura')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5 sm:col-span-1">
                      <Label htmlFor="api-key-exp" className="text-xs">
                        {t('user-settings-dialog.scadenza')}</Label>
                      <Select
                        value={newKeyExpiry}
                        onValueChange={setNewKeyExpiry}
                      >
                        <SelectTrigger id="api-key-exp" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">{t('user-settings-dialog.30-giorni')}</SelectItem>
                          <SelectItem value="90">{t('user-settings-dialog.90-giorni')}</SelectItem>
                          <SelectItem value="365">{t('user-settings-dialog.1-anno')}</SelectItem>
                          <SelectItem value="never">
                            {t('user-settings-dialog.nessuna-scadenza')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <VaultScopeSelector
                    scopeMode={newKeyScopeMode}
                    onScopeModeChange={setNewKeyScopeMode}
                    selectedVaultIds={newKeyVaultIds}
                    onToggleVault={toggleSelectedVault}
                    vaults={vaults}
                  />

                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={creatingKey}>
                      <KeyRound className="size-3.5" />
                      {creatingKey ? 'Generazione...' : t('user-settings-dialog.genera-api-key')}
                    </Button>
                  </div>
                </form>

                {/* API KEYS LIST */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('user-settings-dialog.le-tue-api-key')}{apiKeys.length})
                    </h4>
                  </div>

                  {loadingApiKeys ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      {t('user-settings-dialog.caricamento-api-key')}</p>
                  ) : apiKeys.length === 0 ? (
                    <div className="rounded-xl border border-dashed py-8 text-center">
                      <KeyRound className="mx-auto size-7 text-muted-foreground/60" />
                      <p className="mt-2 text-sm font-medium">
                        {t('user-settings-dialog.nessuna-api-key-attiva')}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('user-settings-dialog.genera-una-chiave-sopra-per-accedere-alle-api-re')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {apiKeys.map((key) => (
                        <ScopedKeyCard
                          key={key.id}
                          item={key}
                          vaultMap={vaultMap}
                          onRevoke={() => setPendingRevokeKey(key)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* QUICK USAGE SNIPPET */}
                <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <Terminal className="size-3.5 text-primary" />
                      {t('user-settings-dialog.esempio-utilizzo-api-rest')}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        copyText(curlExample, t('user-settings-dialog.comando-curl'), setCopiedCurl)
                      }
                    >
                      {copiedCurl ? (
                        <>
                          <Check className="size-3 text-emerald-500" />
                          {t('user-settings-dialog.copiato')}</>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          {t('user-settings-dialog.copia-curl')}</>
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t('user-settings-dialog.puoi-autenticare-qualsiasi-chiamata-a')}{' '}
                    <code className="font-mono">/api/v1/vaults</code> o{' '}
                    <code className="font-mono">/api/v1/credentials</code>{' '}
                    {t('user-settings-dialog.passando-l-header')}{' '}
                    <code className="font-mono">
                      {t('user-settings-dialog.authorization-bearer-sw-live')}</code>{' '}
                    {t('user-settings-dialog.oppure')} <code className="font-mono">X-API-Key</code>:
                  </p>
                  <pre className="overflow-x-auto rounded-lg border bg-background p-2.5 font-mono text-[11px] leading-relaxed">
                    {curlExample}
                  </pre>
                </div>
              </TabsContent>

              {/* TAB 5: MCP SERVER */}
              <TabsContent value="mcp" className="mt-0 min-w-0 space-y-5">
                {newlyCreatedMcpKey && (
                  <div className="space-y-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        <AlertTriangle className="size-4 shrink-0" />
                        <span>
                          {t('user-settings-dialog.copia-subito-la-tua-nuova-chiave-mcp')}{newlyCreatedMcpKey.mcp_key.name}"
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setNewlyCreatedMcpKey(null)}
                      >
                        {t('user-settings-dialog.chiudi')}</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('user-settings-dialog.per-motivi-di-sicurezza-il-token-completo-viene-')}{' '}
                      <strong className="text-foreground">
                        {t('user-settings-dialog.una-sola-volta')}</strong>{' '}
                      {t('user-settings-dialog.ed-e-salvato-sul-server-esclusivamente-come-hash')}</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-lg border bg-background px-3 py-2 font-mono text-xs break-all select-all">
                        {newlyCreatedMcpKey.secret_key}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          copyText(
                            newlyCreatedMcpKey.secret_key,
                            t('user-settings-dialog.chiave-mcp'),
                            setCopiedMcpSecretKey,
                          )
                        }
                      >
                        {copiedMcpSecretKey ? (
                          <>
                            <Check className="size-3.5" />
                            {t('user-settings-dialog.copiata')}</>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            {t('user-settings-dialog.copia')}</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                <form
                  onSubmit={handleCreateMcpKey}
                  className="space-y-3.5 rounded-xl border bg-muted/20 p-3.5"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Plus className="size-4 text-primary" />
                    {t('user-settings-dialog.genera-nuova-chiave-mcp')}</div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-1">
                      <Label htmlFor="mcp-key-name" className="text-xs">
                        {t('user-settings-dialog.nome-client-chiave')}</Label>
                      <Input
                        id="mcp-key-name"
                        placeholder={t('user-settings-dialog.es-claude-code-cursor-antigravity')}
                        value={newMcpKeyName}
                        onChange={(e) => setNewMcpKeyName(e.target.value)}
                        maxLength={80}
                        required
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-1">
                      <Label htmlFor="mcp-key-perm" className="text-xs">
                        {t('user-settings-dialog.permessi')}</Label>
                      <Select
                        value={newMcpKeyPermission}
                        onValueChange={(v) =>
                          setNewMcpKeyPermission(v as ApiKeyPermission)
                        }
                      >
                        <SelectTrigger id="mcp-key-perm" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">
                            {t('user-settings-dialog.sola-lettura-read')}</SelectItem>
                          <SelectItem value="read_write">
                            {t('user-settings-dialog.lettura-e-scrittura')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5 sm:col-span-1">
                      <Label htmlFor="mcp-key-exp" className="text-xs">
                        {t('user-settings-dialog.scadenza')}</Label>
                      <Select
                        value={newMcpKeyExpiry}
                        onValueChange={setNewMcpKeyExpiry}
                      >
                        <SelectTrigger id="mcp-key-exp" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">{t('user-settings-dialog.30-giorni')}</SelectItem>
                          <SelectItem value="90">{t('user-settings-dialog.90-giorni')}</SelectItem>
                          <SelectItem value="365">{t('user-settings-dialog.1-anno')}</SelectItem>
                          <SelectItem value="never">
                            {t('user-settings-dialog.nessuna-scadenza')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <VaultScopeSelector
                    scopeMode={newMcpKeyScopeMode}
                    onScopeModeChange={setNewMcpKeyScopeMode}
                    selectedVaultIds={newMcpKeyVaultIds}
                    onToggleVault={toggleSelectedMcpVault}
                    vaults={vaults}
                  />

                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={creatingMcpKey}>
                      <Plug className="size-3.5" />
                      {creatingMcpKey ? 'Generazione...' : t('user-settings-dialog.genera-chiave-mcp')}
                    </Button>
                  </div>
                </form>

                {/* MCP KEYS LIST */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('user-settings-dialog.le-tue-chiavi-mcp')}{mcpKeys.length})
                    </h4>
                  </div>

                  {loadingMcpKeys ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      {t('user-settings-dialog.caricamento-chiavi-mcp')}</p>
                  ) : mcpKeys.length === 0 ? (
                    <div className="rounded-xl border border-dashed py-8 text-center">
                      <Plug className="mx-auto size-7 text-muted-foreground/60" />
                      <p className="mt-2 text-sm font-medium">
                        {t('user-settings-dialog.nessuna-chiave-mcp-attiva')}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('user-settings-dialog.genera-una-chiave-mcp-dedicata-sw-mcp-per-colleg')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {mcpKeys.map((key) => (
                        <ScopedKeyCard
                          key={key.id}
                          item={key}
                          vaultMap={vaultMap}
                          onRevoke={() => setPendingRevokeMcpKey(key)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* MCP CLIENT CONNECTION SNIPPET */}
                <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <Terminal className="size-3.5 text-primary" />
                      {t('user-settings-dialog.configurazione-client-mcp-streamable-http')}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        copyText(
                          mcpConfigSnippet,
                          t('user-settings-dialog.configurazione-mcp'),
                          setCopiedMcpConfig,
                        )
                      }
                    >
                      {copiedMcpConfig ? (
                        <>
                          <Check className="size-3 text-emerald-500" />
                          {t('user-settings-dialog.copiata')}</>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          {t('user-settings-dialog.copia-config')}</>
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                      Endpoint:
                    </span>
                    <code className="min-w-0 flex-1 truncate rounded border bg-background px-2 py-1 font-mono text-[11px]">
                      {mcpEndpoint}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        copyText(
                          mcpEndpoint,
                          t('user-settings-dialog.endpoint-mcp'),
                          setCopiedMcpEndpoint,
                        )
                      }
                    >
                      {copiedMcpEndpoint ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      {t('user-settings-dialog.copia-url')}</Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-background p-0.5 text-xs">
                    {(
                      [
                        { id: 'json', label: t('user-settings-dialog.json-mcpservers') },
                        { id: 'claude-code', label: 'Claude Code' },
                        { id: 'vscode', label: t('user-settings-dialog.vs-code') },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMcpSnippetClient(opt.id)}
                        className={cn(
                          'flex-1 cursor-pointer rounded-md px-2.5 py-1 text-[11px] transition-colors',
                          mcpSnippetClient === opt.id
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <pre className="overflow-x-auto rounded-lg border bg-background p-2.5 font-mono text-[11px] leading-relaxed">
                    {mcpConfigSnippet}
                  </pre>

                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    <strong className="text-foreground">{t('user-settings-dialog.isolamento-sicurezza')}</strong>{' '}
                    {t('user-settings-dialog.le-chiavi-mcp')}<code className="font-mono">sw_mcp_...</code>{t('user-settings-dialog.funzionano-solo-su')} <code className="font-mono">/api/mcp</code>{' '}
                    {t('user-settings-dialog.le-chiavi-rest')} <code className="font-mono">sw_live_...</code>{' '}
                    {t('user-settings-dialog.vengono-rifiutate-liste-e-risorse-espongono-solo')}{' '}
                    <code className="font-mono">get_credential</code> {t('user-settings-dialog.con-registrazione-nell-audit-log')}</p>
                </div>
              </TabsContent>
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background via-background/60 to-transparent backdrop-blur-[4px]"
              />
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
            <AlertDialogTitle>{t('user-settings-dialog.revocare-questa-api-key')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('user-settings-dialog.la-chiave')}{' '}
              <strong className="text-foreground">
                "{pendingRevokeKey?.name}"
              </strong>{' '}
              (<code className="font-mono">{pendingRevokeKey?.key_prefix}</code>
              {t('user-settings-dialog.verra-disattivata-immediatamente-qualsiasi-scrip')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('user-settings-dialog.annulla')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmRevokeApiKey}
            >
              {t('user-settings-dialog.revoca-definitivamente')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* REVOKE MCP KEY CONFIRMATION */}
      <AlertDialog
        open={Boolean(pendingRevokeMcpKey)}
        onOpenChange={(openState) => {
          if (!openState) setPendingRevokeMcpKey(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('user-settings-dialog.revocare-questa-chiave-mcp')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('user-settings-dialog.la-chiave-mcp')}{' '}
              <strong className="text-foreground">
                "{pendingRevokeMcpKey?.name}"
              </strong>{' '}
              (
              <code className="font-mono">
                {pendingRevokeMcpKey?.key_prefix}
              </code>
              {t('user-settings-dialog.verra-disattivata-immediatamente-il-client-ai-o-')}{' '}
              <code className="font-mono">/api/mcp</code>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('user-settings-dialog.annulla')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmRevokeMcpKey}
            >
              {t('user-settings-dialog.revoca-definitivamente')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
