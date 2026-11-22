import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  Clock,
  Copy,
  FolderLock,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { ServiceAccountDialog } from '@/components/service-account-dialog'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { getVaultDisplayIcon, VaultIcon } from '@/components/vault-icon'
import {
  vaultApi,
  type CreatedServiceAccountKey,
  type ServiceAccount,
  type ServiceAccountKey,
  type ServiceAccountResources,
} from '@/lib/api'
import { cn, copyToClipboard } from '@/lib/utils'
import {
  formatRelativeDate,
  formatShortDate,
  getVaultColor,
} from '@/lib/vault-utils'

interface ServiceAccountsSectionProps {
  onAccountsChanged?: (accounts: ServiceAccount[]) => void
}

type StatusFilter = '' | 'active' | 'disabled'

interface RevealedSecretState {
  accountName: string
  key: CreatedServiceAccountKey
}

export function ServiceAccountsSection({
  onAccountsChanged,
}: ServiceAccountsSectionProps) {
  const [accounts, setAccounts] = useState<ServiceAccount[]>([])
  const [resources, setResources] = useState<ServiceAccountResources>({
    vaults: [],
    credentials: [],
  })
  const [loading, setLoading] = useState(true)
  const [loadingResources, setLoadingResources] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<ServiceAccount | null>(
    null,
  )

  const [keyDialogAccount, setKeyDialogAccount] =
    useState<ServiceAccount | null>(null)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyExpiry, setNewKeyExpiry] = useState('90')
  const [creatingKey, setCreatingKey] = useState(false)

  const [revealedSecret, setRevealedSecret] =
    useState<RevealedSecretState | null>(null)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [copiedCurl, setCopiedCurl] = useState(false)

  const [busyAccountId, setBusyAccountId] = useState<string | null>(null)
  const [pendingDeleteAccount, setPendingDeleteAccount] =
    useState<ServiceAccount | null>(null)
  const [pendingRevokeKey, setPendingRevokeKey] = useState<{
    account: ServiceAccount
    key: ServiceAccountKey
  } | null>(null)

  const loadData = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setLoadingResources(true)
      try {
        const [list, resData] = await Promise.all([
          vaultApi.listServiceAccounts(),
          vaultApi.listServiceAccountResources(),
        ])
        setAccounts(list)
        setResources(resData)
        onAccountsChanged?.(list)
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Errore nel caricamento dei Service Account',
        )
      } finally {
        setLoading(false)
        setLoadingResources(false)
        setRefreshing(false)
      }
    },
    [onAccountsChanged],
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return accounts.filter((sa) => {
      if (statusFilter === 'active' && !sa.is_active) return false
      if (statusFilter === 'disabled' && sa.is_active) return false
      if (q) {
        const vaultNames = sa.vaults.map((v) => v.name).join(' ')
        const credTitles = sa.credentials.map((c) => c.title).join(' ')
        const hay =
          `${sa.name} ${sa.email} ${sa.description} ${vaultNames} ${credTitles}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [accounts, searchQuery, statusFilter])

  const openCreateDialog = async () => {
    setEditingAccount(null)
    setDialogOpen(true)
    setLoadingResources(true)
    try {
      const fresh = await vaultApi.listServiceAccountResources()
      setResources(fresh)
    } catch {
      // keep existing cached resources
    } finally {
      setLoadingResources(false)
    }
  }

  const openEditDialog = async (account: ServiceAccount) => {
    setEditingAccount(account)
    setDialogOpen(true)
    setLoadingResources(true)
    try {
      const fresh = await vaultApi.listServiceAccountResources()
      setResources(fresh)
    } catch {
      // keep existing cached resources
    } finally {
      setLoadingResources(false)
    }
  }

  const handleSavedAccount = (
    saved: ServiceAccount,
    initialKey: CreatedServiceAccountKey | null,
  ) => {
    setAccounts((prev) => {
      const exists = prev.some((a) => a.id === saved.id)
      const next = exists
        ? prev.map((a) => (a.id === saved.id ? saved : a))
        : [saved, ...prev]
      onAccountsChanged?.(next)
      return next
    })
    if (initialKey) {
      setRevealedSecret({ accountName: saved.name, key: initialKey })
    }
  }

  const handleToggleActive = async (account: ServiceAccount) => {
    setBusyAccountId(account.id)
    try {
      const updated = await vaultApi.updateServiceAccount(account.id, {
        is_active: !account.is_active,
      })
      setAccounts((prev) => {
        const next = prev.map((a) => (a.id === updated.id ? updated : a))
        onAccountsChanged?.(next)
        return next
      })
      toast.success(
        updated.is_active
          ? `Service Account "${updated.name}" riattivato`
          : `Service Account "${updated.name}" disabilitato`,
      )
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore durante aggiornamento stato',
      )
    } finally {
      setBusyAccountId(null)
    }
  }

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyDialogAccount) return
    const cleanName = newKeyName.trim()
    if (!cleanName) {
      toast.error('Inserisci un nome per la chiave API')
      return
    }

    setCreatingKey(true)
    try {
      const expiresInDays =
        newKeyExpiry === 'never' ? null : Number.parseInt(newKeyExpiry, 10)
      const created = await vaultApi.createServiceAccountKey(
        keyDialogAccount.id,
        {
          name: cleanName,
          expires_in_days: expiresInDays,
        },
      )
      setAccounts((prev) => {
        const next = prev.map((a) =>
          a.id === keyDialogAccount.id
            ? { ...a, keys: [created.key, ...a.keys] }
            : a,
        )
        onAccountsChanged?.(next)
        return next
      })
      setRevealedSecret({
        accountName: keyDialogAccount.name,
        key: created,
      })
      toast.success(
        `Nuova chiave API "${created.key.name}" generata per ${keyDialogAccount.name}`,
      )
      setKeyDialogAccount(null)
      setNewKeyName('')
      setNewKeyExpiry('90')
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore nella generazione della chiave API',
      )
    } finally {
      setCreatingKey(false)
    }
  }

  const confirmRevokeKey = async () => {
    if (!pendingRevokeKey) return
    const { account, key } = pendingRevokeKey
    setPendingRevokeKey(null)
    setBusyAccountId(account.id)
    try {
      await vaultApi.deleteServiceAccountKey(account.id, key.id)
      setAccounts((prev) => {
        const next = prev.map((a) =>
          a.id === account.id
            ? { ...a, keys: a.keys.filter((k) => k.id !== key.id) }
            : a,
        )
        onAccountsChanged?.(next)
        return next
      })
      if (revealedSecret?.key.key.id === key.id) {
        setRevealedSecret(null)
      }
      toast.success(`Chiave API "${key.name}" revocata`)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore durante la revoca della chiave API',
      )
    } finally {
      setBusyAccountId(null)
    }
  }

  const confirmDeleteAccount = async () => {
    if (!pendingDeleteAccount) return
    const target = pendingDeleteAccount
    setPendingDeleteAccount(null)
    setBusyAccountId(target.id)
    try {
      await vaultApi.deleteServiceAccount(target.id)
      setAccounts((prev) => {
        const next = prev.filter((a) => a.id !== target.id)
        onAccountsChanged?.(next)
        return next
      })
      if (revealedSecret?.accountName === target.name) {
        setRevealedSecret(null)
      }
      toast.success(`Service Account "${target.name}" eliminato`)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Errore durante l'eliminazione del Service Account",
      )
    } finally {
      setBusyAccountId(null)
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
      toast.error('Impossibile copiare negli appunti')
    }
  }

  const apiOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000'
  const revealedCurl = revealedSecret
    ? `curl -s -H "Authorization: Bearer ${revealedSecret.key.secret_key}" "${apiOrigin}/api/v1/credentials"`
    : ''

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3 sm:px-6">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca service account, cartella o credenziale..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 rounded-xl border-border/70 bg-card/50 pr-10 pl-10 text-sm"
          />
          {searchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setSearchQuery('')}
              className="absolute top-1/2 right-2.5 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Cancella ricerca"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-card/50 p-1">
            {(
              [
                { value: '', label: 'Tutti' },
                { value: 'active', label: 'Attivi' },
                { value: 'disabled', label: 'Disabilitati' },
              ] as const
            ).map((pill) => {
              const active = statusFilter === pill.value
              return (
                <button
                  key={pill.label}
                  type="button"
                  onClick={() => setStatusFilter(pill.value)}
                  className={cn(
                    'inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors',
                    active
                      ? 'bg-foreground text-background shadow-xs sync-security:bg-[#ff9c00] sync-security:text-[#000c20]'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {pill.label}
                </button>
              )
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => loadData(true)}
            className="h-10 gap-1.5 border-border/70 bg-card/50 px-3.5 text-xs"
          >
            <RefreshCw
              className={cn('size-3.5', refreshing && 'animate-spin')}
            />
            <span className="hidden sm:inline">Aggiorna</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={openCreateDialog}
            className="h-10 gap-1.5 px-4 text-xs font-semibold"
          >
            <Plus className="size-4" />
            <span>Nuovo Service Account</span>
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-5 pb-6 sm:px-6">
        <div className="space-y-4">
          {/* One-Time Secret Key Reveal Banner */}
          {revealedSecret && (
            <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-500 dark:text-emerald-400">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    Chiave API generata per "{revealedSecret.accountName}" —{' '}
                    {revealedSecret.key.key.name}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setRevealedSecret(null)}
                >
                  Chiudi
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Copia e salva subito questa chiave API: per motivi di sicurezza
                viene mostrata{' '}
                <strong className="text-foreground">una sola volta</strong> ed
                è archiviata esclusivamente come hash SHA-256.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 rounded-lg border bg-background px-3 py-2 font-mono text-xs break-all select-all">
                  {revealedSecret.key.secret_key}
                </code>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    copyText(
                      revealedSecret.key.secret_key,
                      'Chiave API Service Account',
                      setCopiedSecret,
                    )
                  }
                >
                  {copiedSecret ? (
                    <>
                      <Check className="size-3.5" />
                      Copiata
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      Copia chiave
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-1.5 rounded-xl border border-border/60 bg-background/70 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                    <Terminal className="size-3.5 text-emerald-400" />
                    Esempio chiamata API (Authorization Bearer o X-API-Key)
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      copyText(revealedCurl, 'Comando cURL', setCopiedCurl)
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
                <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-foreground">
                  {revealedCurl}
                </pre>
              </div>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="space-y-3 rounded-xl border border-border/60 bg-card/40 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-10 rounded-xl" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="h-3 w-64" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-36 rounded-lg" />
                  </div>
                  <Skeleton className="h-8 w-full rounded-lg" />
                </div>
              ))}
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/20 px-6 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]">
                <Bot className="size-6" />
              </div>
              <p className="mt-3 text-sm font-semibold">
                {accounts.length === 0
                  ? 'Nessun Service Account configurato'
                  : 'Nessun Service Account corrisponde ai filtri'}
              </p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                {accounts.length === 0
                  ? 'Crea un utente di sistema dedicato per CI/CD, script o microservizi e assegna l’accesso esclusivamente a cartelle e credenziali specifiche tramite chiave API.'
                  : 'Prova a modificare i criteri di ricerca o il filtro di stato.'}
              </p>
              {accounts.length === 0 && (
                <Button
                  type="button"
                  size="sm"
                  onClick={openCreateDialog}
                  className="mt-4 gap-1.5"
                >
                  <Plus className="size-4" />
                  Crea il primo Service Account
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAccounts.map((sa) => {
                const isBusy = busyAccountId === sa.id
                return (
                  <div
                    key={sa.id}
                    className={cn(
                      'space-y-3.5 rounded-2xl border p-4 transition-colors',
                      sa.is_active
                        ? 'border-border/70 bg-card/45 hover:border-border'
                        : 'border-border/50 bg-card/20 opacity-80',
                    )}
                  >
                    {/* Top Row: Identity & Main Actions */}
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-xl border',
                            sa.is_active
                              ? 'border-border bg-muted text-foreground sync-security:border-[#ff9c00]/30 sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]'
                              : 'border-border bg-muted text-muted-foreground',
                          )}
                        >
                          <Bot className="size-5" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-semibold text-foreground">
                              {sa.name}
                            </h3>
                            {sa.is_active ? (
                              <Badge
                                variant="secondary"
                                className="border-emerald-500/30 bg-emerald-500/15 px-2 py-0 text-[10px] font-semibold text-emerald-400"
                              >
                                Attivo
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 bg-amber-500/10 px-2 py-0 text-[10px] font-semibold text-amber-400"
                              >
                                Disabilitato
                              </Badge>
                            )}
                            <Badge
                              variant={
                                sa.permission === 'read_write'
                                  ? 'default'
                                  : 'outline'
                              }
                              className="px-2 py-0 text-[10px]"
                            >
                              {sa.permission === 'read_write'
                                ? 'Lettura & Scrittura'
                                : 'Sola lettura'}
                            </Badge>
                          </div>

                          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                            {sa.email}
                          </p>
                          {sa.description && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {sa.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <div
                          className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-1 text-[11px] text-muted-foreground"
                          title={
                            sa.is_active
                              ? 'Disabilita Service Account'
                              : 'Riattiva Service Account'
                          }
                        >
                          <span>{sa.is_active ? 'Attivo' : 'Sospeso'}</span>
                          <Switch
                            checked={sa.is_active}
                            disabled={isBusy}
                            onCheckedChange={() => handleToggleActive(sa)}
                          />
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={isBusy}
                          onClick={() => openEditDialog(sa)}
                          className="h-8 gap-1 px-2.5 text-xs"
                        >
                          <Pencil className="size-3.5" />
                          <span>Modifica scope</span>
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={isBusy}
                          onClick={() => {
                            setKeyDialogAccount(sa)
                            setNewKeyName('')
                            setNewKeyExpiry('90')
                          }}
                          className="h-8 gap-1 px-2.5 text-xs"
                        >
                          <Plus className="size-3.5" />
                          <span>Chiave API</span>
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={isBusy}
                          onClick={() => setPendingDeleteAccount(sa)}
                          className="size-8 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          title={`Elimina ${sa.name}`}
                          aria-label={`Elimina ${sa.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Scope Section: Assigned Folders & Specific Credentials */}
                    <div className="space-y-2 rounded-xl border border-border/60 bg-background/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-semibold tracking-wider uppercase">
                          <FolderLock className="size-3.5 text-primary sync-security:text-[#ff9c00]" />
                          Accessi autorizzati
                        </span>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3" />
                            Creato {formatShortDate(sa.created_at)}
                            {sa.created_by_name
                              ? ` da ${sa.created_by_name}`
                              : ''}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="size-3 text-emerald-400" />
                            {sa.last_used_at
                              ? `Ultimo uso ${formatRelativeDate(sa.last_used_at)}`
                              : 'Mai utilizzato'}
                          </span>
                        </div>
                      </div>

                      {sa.vaults.length === 0 && sa.credentials.length === 0 ? (
                        <p className="text-xs text-amber-400">
                          Nessuna cartella o credenziale assegnata — usa
                          "Modifica scope" per autorizzare risorse.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {sa.vaults.map((v) => {
                            const palette = getVaultColor(v.color)
                            return (
                              <Badge
                                key={`vault-${v.id}`}
                                variant="secondary"
                                className="gap-1.5 rounded-lg border border-border/70 bg-card px-2 py-0.5 text-[11px] font-medium"
                              >
                                <VaultIcon
                                  icon={getVaultDisplayIcon(v)}
                                  className={cn('size-3', palette.text)}
                                />
                                <span>Cartella: {v.name}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  ({v.credential_count})
                                </span>
                              </Badge>
                            )
                          })}

                          {sa.credentials.map((c) => (
                            <Badge
                              key={`cred-${c.id}`}
                              variant="outline"
                              className="gap-1.5 rounded-lg border-border bg-secondary/70 px-2 py-0.5 text-[11px] font-medium text-foreground sync-security:border-[#ff9c00]/30 sync-security:bg-[#ff9c00]/10"
                            >
                              <KeyRound className="size-3 text-muted-foreground sync-security:text-[#ff9c00]" />
                              <span>{c.title}</span>
                              <span className="text-[10px] text-muted-foreground">
                                ({c.vault_name})
                              </span>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* API Keys Sub-list */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                        <span>Chiavi API associate ({sa.keys.length})</span>
                      </div>

                      {sa.keys.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                          Nessuna chiave API attiva. Premi "+ Chiave API" per
                          generarne una.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {sa.keys.map((key) => (
                            <div
                              key={key.id}
                              className="flex flex-col justify-between gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs sm:flex-row sm:items-center"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-foreground">
                                    {key.name}
                                  </span>
                                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                                    {key.key_prefix}••••••••
                                  </code>
                                  {key.is_expired && (
                                    <Badge
                                      variant="destructive"
                                      className="h-4 px-1.5 py-0 text-[9px]"
                                    >
                                      Scaduta
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
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

                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={isBusy}
                                onClick={() =>
                                  setPendingRevokeKey({ account: sa, key })
                                }
                                className="shrink-0 self-end text-destructive hover:bg-destructive/10 hover:text-destructive sm:self-center"
                              >
                                <Trash2 className="size-3.5" />
                                Revoca
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Create / Edit Service Account Dialog */}
      <ServiceAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingAccount={editingAccount}
        resources={resources}
        loadingResources={loadingResources}
        onSaved={handleSavedAccount}
      />

      {/* Generate Additional API Key Dialog */}
      <Dialog
        open={Boolean(keyDialogAccount)}
        onOpenChange={(open) => {
          if (!open) setKeyDialogAccount(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4.5 text-primary sync-security:text-[#ff9c00]" />
              Nuova chiave API
            </DialogTitle>
            <DialogDescription>
              Genera una nuova chiave API (<code>sw_sa_...</code>) per{' '}
              <strong className="text-foreground">
                {keyDialogAccount?.name}
              </strong>
              . Ideale per la rotazione a zero downtime.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateKey} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sa-new-key-name" className="text-xs">
                  Nome chiave API *
                </Label>
                <Input
                  id="sa-new-key-name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="es. Rotazione Q4, Cluster EU-West"
                  maxLength={80}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sa-new-key-expiry" className="text-xs">
                  Scadenza
                </Label>
                <Select value={newKeyExpiry} onValueChange={setNewKeyExpiry}>
                  <SelectTrigger id="sa-new-key-expiry" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 giorni</SelectItem>
                    <SelectItem value="90">90 giorni</SelectItem>
                    <SelectItem value="365">1 anno</SelectItem>
                    <SelectItem value="never">Nessuna scadenza</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setKeyDialogAccount(null)}
                disabled={creatingKey}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={creatingKey}>
                {creatingKey ? 'Generazione...' : 'Genera chiave API'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Service Account Confirmation */}
      <AlertDialog
        open={Boolean(pendingDeleteAccount)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteAccount(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo Service Account?</AlertDialogTitle>
            <AlertDialogDescription>
              Il Service Account{' '}
              <strong className="text-foreground">
                "{pendingDeleteAccount?.name}"
              </strong>{' '}
              e tutte le sue chiavi API verranno eliminati definitivamente. Le
              credenziali esistenti nelle cartelle rimarranno intatte, ma tutti
              i sistemi che usano queste chiavi perderanno immediatamente
              l&apos;accesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteAccount}
            >
              Elimina Service Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Single API Key Confirmation */}
      <AlertDialog
        open={Boolean(pendingRevokeKey)}
        onOpenChange={(open) => {
          if (!open) setPendingRevokeKey(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocare questa chiave API?</AlertDialogTitle>
            <AlertDialogDescription>
              La chiave{' '}
              <strong className="text-foreground">
                "{pendingRevokeKey?.key.name}"
              </strong>{' '}
              (
              <code className="font-mono">
                {pendingRevokeKey?.key.key_prefix}
              </code>
              ) del Service Account{' '}
              <strong className="text-foreground">
                {pendingRevokeKey?.account.name}
              </strong>{' '}
              verrà disattivata immediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRevokeKey}>
              Revoca chiave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
