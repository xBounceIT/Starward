import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Bot,
  Check,
  Folder,
  KeyRound,
  Search,
  Shield,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { VaultIcon } from '@/components/vault-icon'
import {
  vaultApi,
  type ApiKeyPermission,
  type CreatedServiceAccountKey,
  type ServiceAccount,
  type ServiceAccountResources,
} from '@/lib/api'
import { getCategoryLabel } from '@/lib/credential-types'
import { cn } from '@/lib/utils'
import { getVaultColor } from '@/lib/vault-utils'

interface ServiceAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingAccount: ServiceAccount | null
  resources: ServiceAccountResources
  loadingResources?: boolean
  onSaved: (
    account: ServiceAccount,
    initialKey: CreatedServiceAccountKey | null,
  ) => void
}

const ALL_VAULTS_FILTER = '__all__'

export function ServiceAccountDialog({
  open,
  onOpenChange,
  editingAccount,
  resources,
  loadingResources = false,
  onSaved,
}: ServiceAccountDialogProps) {
  const isEditing = Boolean(editingAccount)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permission, setPermission] = useState<ApiKeyPermission>('read')
  const [isActive, setIsActive] = useState(true)
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>([])
  const [selectedCredentialIds, setSelectedCredentialIds] = useState<string[]>(
    [],
  )

  // Initial key options (create mode only)
  const [generateInitialKey, setGenerateInitialKey] = useState(true)
  const [initialKeyName, setInitialKeyName] = useState('Chiave primaria')
  const [initialKeyExpiry, setInitialKeyExpiry] = useState('90')

  // Picker filters
  const [scopeTab, setScopeTab] = useState<'vaults' | 'credentials'>('vaults')
  const [vaultSearch, setVaultSearch] = useState('')
  const [credSearch, setCredSearch] = useState('')
  const [credVaultFilter, setCredVaultFilter] = useState(ALL_VAULTS_FILTER)

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editingAccount) {
      setName(editingAccount.name)
      setDescription(editingAccount.description)
      setPermission(editingAccount.permission)
      setIsActive(editingAccount.is_active)
      setSelectedVaultIds(editingAccount.vault_ids)
      setSelectedCredentialIds(editingAccount.credential_ids)
    } else {
      setName('')
      setDescription('')
      setPermission('read')
      setIsActive(true)
      setSelectedVaultIds([])
      setSelectedCredentialIds([])
      setGenerateInitialKey(true)
      setInitialKeyName('Chiave primaria')
      setInitialKeyExpiry('90')
    }
    setScopeTab('vaults')
    setVaultSearch('')
    setCredSearch('')
    setCredVaultFilter(ALL_VAULTS_FILTER)
  }, [open, editingAccount])

  const selectedVaultSet = useMemo(
    () => new Set(selectedVaultIds),
    [selectedVaultIds],
  )
  const selectedCredSet = useMemo(
    () => new Set(selectedCredentialIds),
    [selectedCredentialIds],
  )

  const filteredVaults = useMemo(() => {
    const q = vaultSearch.trim().toLowerCase()
    if (!q) return resources.vaults
    return resources.vaults.filter((v) =>
      `${v.name} ${v.description} ${v.owner_name} ${v.owner_email}`
        .toLowerCase()
        .includes(q),
    )
  }, [resources.vaults, vaultSearch])

  const filteredCredentials = useMemo(() => {
    const q = credSearch.trim().toLowerCase()
    return resources.credentials.filter((c) => {
      if (credVaultFilter !== ALL_VAULTS_FILTER && c.vault_id !== credVaultFilter) {
        return false
      }
      if (q) {
        const hay =
          `${c.title} ${c.username} ${c.url} ${c.vault_name} ${getCategoryLabel(c.category)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [resources.credentials, credSearch, credVaultFilter])

  const toggleVault = (vaultId: string) => {
    setSelectedVaultIds((prev) =>
      prev.includes(vaultId)
        ? prev.filter((id) => id !== vaultId)
        : [...prev, vaultId],
    )
  }

  const toggleCredential = (credentialId: string) => {
    setSelectedCredentialIds((prev) =>
      prev.includes(credentialId)
        ? prev.filter((id) => id !== credentialId)
        : [...prev, credentialId],
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) {
      toast.error('Inserisci un nome per il Service Account')
      return
    }
    if (!isEditing && generateInitialKey && !initialKeyName.trim()) {
      toast.error('Inserisci un nome per la chiave API iniziale')
      return
    }

    setSubmitting(true)
    try {
      if (editingAccount) {
        const updated = await vaultApi.updateServiceAccount(editingAccount.id, {
          name: cleanName,
          description: description.trim(),
          permission,
          is_active: isActive,
          vault_ids: selectedVaultIds,
          credential_ids: selectedCredentialIds,
        })
        toast.success(`Service Account "${updated.name}" aggiornato`)
        onSaved(updated, null)
        onOpenChange(false)
      } else {
        const expiresInDays =
          initialKeyExpiry === 'never'
            ? null
            : Number.parseInt(initialKeyExpiry, 10)
        const created = await vaultApi.createServiceAccount({
          name: cleanName,
          description: description.trim(),
          permission,
          vault_ids: selectedVaultIds,
          credential_ids: selectedCredentialIds,
          generate_initial_key: generateInitialKey,
          initial_key_name: generateInitialKey
            ? initialKeyName.trim()
            : undefined,
          initial_key_expires_in_days: generateInitialKey
            ? expiresInDays
            : undefined,
        })
        toast.success(
          `Service Account "${created.service_account.name}" creato`,
        )
        onSaved(created.service_account, created.initial_key)
        onOpenChange(false)
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore durante il salvataggio del Service Account',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const hasAnyScope =
    selectedVaultIds.length > 0 || selectedCredentialIds.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-primary sync-security:text-[#ff9c00]" />
            {isEditing
              ? `Modifica Service Account "${editingAccount?.name}"`
              : 'Nuovo Service Account'}
          </DialogTitle>
          <DialogDescription>
            Configura un utente di sistema autenticato tramite chiave API
            dedicata e seleziona le cartelle e/o credenziali specifiche
            accessibili.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {/* Base Info */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sa-name" className="text-xs">
                  Nome Service Account *
                </Label>
                <Input
                  id="sa-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="es. CI/CD Produzione, Kubernetes Sync"
                  maxLength={80}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sa-permission" className="text-xs">
                  Livello di permessi
                </Label>
                <Select
                  value={permission}
                  onValueChange={(v) => setPermission(v as ApiKeyPermission)}
                >
                  <SelectTrigger id="sa-permission" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">
                      Sola lettura (Read) — recupero credenziali
                    </SelectItem>
                    <SelectItem value="read_write">
                      Lettura e scrittura (Read/Write)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sa-description" className="text-xs">
                Descrizione (opzionale)
              </Label>
              <Textarea
                id="sa-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Indica quale servizio, pipeline o automazione utilizza questo account di sistema..."
                maxLength={300}
                rows={2}
                className="min-h-14 resize-none text-sm"
              />
            </div>

            {isEditing && (
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3.5 py-2.5 text-xs">
                <div>
                  <span className="font-medium text-foreground">
                    Service Account attivo
                  </span>
                  <p className="text-muted-foreground">
                    Disattivandolo tutte le chiavi API associate vengono
                    temporaneamente bloccate.
                  </p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </label>
            )}

            <Separator />

            {/* Scope Selection: Specific Folders & Specific Credentials */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label className="flex items-center gap-1.5 text-sm font-semibold">
                    <Shield className="size-4 text-primary sync-security:text-[#ff9c00]" />
                    Ambito di accesso (Cartelle e Credenziali)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Seleziona intere cartelle e/o singole credenziali specifiche
                    (accesso granulare secondo il principio del minimo
                    privilegio).
                  </p>
                </div>
              </div>

              <Tabs
                value={scopeTab}
                onValueChange={(v) =>
                  setScopeTab(v as 'vaults' | 'credentials')
                }
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="vaults" className="gap-1.5 text-xs">
                    <Folder className="size-3.5" />
                    <span>Cartelle specifiche</span>
                    <Badge
                      variant={
                        selectedVaultIds.length > 0 ? 'default' : 'secondary'
                      }
                      className="ml-1 h-4 px-1.5 text-[10px]"
                    >
                      {selectedVaultIds.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="credentials" className="gap-1.5 text-xs">
                    <KeyRound className="size-3.5" />
                    <span>Credenziali specifiche</span>
                    <Badge
                      variant={
                        selectedCredentialIds.length > 0
                          ? 'default'
                          : 'secondary'
                      }
                      className="ml-1 h-4 px-1.5 text-[10px]"
                    >
                      {selectedCredentialIds.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                {/* VAULTS PICKER */}
                <TabsContent value="vaults" className="mt-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Filtra cartelle per nome o proprietario..."
                        value={vaultSearch}
                        onChange={(e) => setVaultSearch(e.target.value)}
                        className="h-8 pr-8 pl-8 text-xs"
                      />
                      {vaultSearch && (
                        <button
                          type="button"
                          onClick={() => setVaultSearch('')}
                          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                    {selectedVaultIds.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setSelectedVaultIds([])}
                      >
                        Deseleziona ({selectedVaultIds.length})
                      </Button>
                    )}
                  </div>

                  <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-border/70 bg-muted/15 p-2">
                    {loadingResources ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        Caricamento cartelle...
                      </p>
                    ) : filteredVaults.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        Nessuna cartella trovata.
                      </p>
                    ) : (
                      filteredVaults.map((vault) => {
                        const checked = selectedVaultSet.has(vault.id)
                        const palette = getVaultColor(vault.color)
                        return (
                          <button
                            key={vault.id}
                            type="button"
                            onClick={() => toggleVault(vault.id)}
                            className={cn(
                              'flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                              checked
                                ? 'border-primary/50 bg-primary/10 sync-security:border-[#ff9c00]/50 sync-security:bg-[#ff9c00]/10'
                                : 'border-transparent bg-card/60 hover:border-border/70 hover:bg-card',
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span
                                className={cn(
                                  'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                                  checked
                                    ? 'border-primary bg-primary text-primary-foreground sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00] sync-security:text-[#000c20]'
                                    : 'border-muted-foreground/40 bg-background',
                                )}
                              >
                                {checked && <Check className="size-3" />}
                              </span>
                              <VaultIcon
                                icon={vault.icon}
                                className={cn('size-4 shrink-0', palette.text)}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-semibold text-foreground">
                                    {vault.name}
                                  </span>
                                  {vault.is_personal && (
                                    <Badge
                                      variant="outline"
                                      className="h-4 px-1 py-0 text-[9px]"
                                    >
                                      Personale
                                    </Badge>
                                  )}
                                </div>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  Proprietario: {vault.owner_name} ·{' '}
                                  {vault.credential_count}{' '}
                                  {vault.credential_count === 1
                                    ? 'credenziale'
                                    : 'credenziali'}
                                </p>
                              </div>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </TabsContent>

                {/* SPECIFIC CREDENTIALS PICKER */}
                <TabsContent value="credentials" className="mt-2.5 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[180px] flex-1">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Cerca credenziale per titolo, username, cartella..."
                        value={credSearch}
                        onChange={(e) => setCredSearch(e.target.value)}
                        className="h-8 pr-8 pl-8 text-xs"
                      />
                      {credSearch && (
                        <button
                          type="button"
                          onClick={() => setCredSearch('')}
                          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>

                    <Select
                      value={credVaultFilter}
                      onValueChange={setCredVaultFilter}
                    >
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue placeholder="Tutte le cartelle" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_VAULTS_FILTER}>
                          Tutte le cartelle
                        </SelectItem>
                        {resources.vaults.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedCredentialIds.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setSelectedCredentialIds([])}
                      >
                        Deseleziona ({selectedCredentialIds.length})
                      </Button>
                    )}
                  </div>

                  <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-border/70 bg-muted/15 p-2">
                    {loadingResources ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        Caricamento credenziali...
                      </p>
                    ) : filteredCredentials.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        Nessuna credenziale trovata.
                      </p>
                    ) : (
                      filteredCredentials.map((cred) => {
                        const checked = selectedCredSet.has(cred.id)
                        const coveredByVault = selectedVaultSet.has(
                          cred.vault_id,
                        )
                        const palette = getVaultColor(cred.vault_color)
                        return (
                          <button
                            key={cred.id}
                            type="button"
                            onClick={() => toggleCredential(cred.id)}
                            className={cn(
                              'flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                              checked
                                ? 'border-primary/50 bg-primary/10 sync-security:border-[#ff9c00]/50 sync-security:bg-[#ff9c00]/10'
                                : 'border-transparent bg-card/60 hover:border-border/70 hover:bg-card',
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span
                                className={cn(
                                  'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                                  checked
                                    ? 'border-primary bg-primary text-primary-foreground sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00] sync-security:text-[#000c20]'
                                    : 'border-muted-foreground/40 bg-background',
                                )}
                              >
                                {checked && <Check className="size-3" />}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="truncate text-xs font-semibold text-foreground">
                                    {cred.title}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="h-4 px-1.5 py-0 text-[9px] text-muted-foreground"
                                  >
                                    {getCategoryLabel(cred.category)}
                                  </Badge>
                                  {coveredByVault && (
                                    <Badge
                                      variant="secondary"
                                      className="h-4 border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[9px] text-emerald-400"
                                    >
                                      Inclusa nella cartella
                                    </Badge>
                                  )}
                                </div>
                                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                                  <span className={cn('font-medium', palette.text)}>
                                    {cred.vault_name}
                                  </span>
                                  {cred.username && (
                                    <>
                                      <span>·</span>
                                      <span className="truncate">
                                        {cred.username}
                                      </span>
                                    </>
                                  )}
                                </p>
                              </div>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Scope summary */}
              {hasAnyScope ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Riepilogo accesso:
                  </span>
                  <span>
                    <strong className="text-foreground">
                      {selectedVaultIds.length}
                    </strong>{' '}
                    {selectedVaultIds.length === 1 ? 'cartella' : 'cartelle'}
                  </span>
                  <span>+</span>
                  <span>
                    <strong className="text-foreground">
                      {selectedCredentialIds.length}
                    </strong>{' '}
                    {selectedCredentialIds.length === 1
                      ? 'credenziale specifica'
                      : 'credenziali specifiche'}
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Nessuna cartella o credenziale selezionata: il Service
                    Account non avrà accesso ad alcuna credenziale finché non
                    assegni almeno una risorsa.
                  </span>
                </div>
              )}
            </div>

            {/* Initial API Key section (Create mode) */}
            {!isEditing && (
              <>
                <Separator />
                <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3.5">
                  <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="flex items-center gap-1.5 font-semibold text-foreground">
                        <KeyRound className="size-3.5 text-primary sync-security:text-[#ff9c00]" />
                        Genera subito la chiave API iniziale
                      </span>
                      <p className="mt-0.5 text-muted-foreground">
                        Potrai comunque generare, ruotare o revocare altre
                        chiavi in seguito.
                      </p>
                    </div>
                    <Switch
                      checked={generateInitialKey}
                      onCheckedChange={setGenerateInitialKey}
                    />
                  </label>

                  {generateInitialKey && (
                    <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="sa-init-key-name" className="text-xs">
                          Nome chiave API
                        </Label>
                        <Input
                          id="sa-init-key-name"
                          value={initialKeyName}
                          onChange={(e) => setInitialKeyName(e.target.value)}
                          placeholder="es. Chiave primaria"
                          maxLength={80}
                          required={generateInitialKey}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="sa-init-key-exp" className="text-xs">
                          Scadenza chiave
                        </Label>
                        <Select
                          value={initialKeyExpiry}
                          onValueChange={setInitialKeyExpiry}
                        >
                          <SelectTrigger
                            id="sa-init-key-exp"
                            className="w-full"
                          >
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
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter className="border-t border-border/70 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Salvataggio...'
                : isEditing
                  ? 'Salva modifiche'
                  : 'Crea Service Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
