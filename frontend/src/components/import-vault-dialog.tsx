import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  FileCode2,
  FileSpreadsheet,
  FileUp,
  Folder,
  FolderOpen,
  Layers,
  Loader2,
  Search,
  Star,
  Tag,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { ImportProviderIcon } from '@/components/import-provider-icon'
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
import { Switch } from '@/components/ui/switch'
import {
  CategoryIcon,
  getVaultDisplayIcon,
  VaultIcon,
} from '@/components/vault-icon'
import {
  vaultApi,
  type ImportPreviewItem,
  type ImportPreviewResponse,
  type ImportResult,
  type Vault,
} from '@/lib/api'
import { getCategoryLabel } from '@/lib/credential-types'
import {
  getImportProviderMeta,
  IMPORT_PROVIDERS,
} from '@/lib/import-providers'
import { cn } from '@/lib/utils'
import { getVaultColor } from '@/lib/vault-utils'

const MAX_IMPORT_BYTES = 10 * 1024 * 1024
const NO_FOLDER_FILTER = '__none__'

// Scrollbar stretta e arrotondata usata nell'anteprima di importazione
const importScrollBarClass = 'w-2 p-px'
const importScrollThumbClass = 'rounded-full'

type ImportStep = 'select' | 'preview' | 'result'
type ImportStatusFilter = 'all' | ImportPreviewItem['status']

interface ImportVaultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vault: Vault | null
  vaults: Vault[]
  onImported: (vaultId: string) => Promise<void> | void
}

export function ImportVaultDialog({
  open,
  onOpenChange,
  vault,
  vaults,
  onImported,
}: ImportVaultDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const writableVaults = useMemo(
    () => vaults.filter((v) => v.role === 'owner' || v.role === 'editor'),
    [vaults],
  )

  const [step, setStep] = useState<ImportStep>('select')
  const [targetVaultId, setTargetVaultId] = useState('')
  const [providerId, setProviderId] = useState('bitwarden')
  const [providerSearch, setProviderSearch] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [folderAsTag, setFolderAsTag] = useState(true)
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const [previewSearch, setPreviewSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ImportStatusFilter>('all')

  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(),
  )
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Reset modal state whenever opened or opened for a new folder
  useEffect(() => {
    if (!open) return
    const fallbackId =
      (vault && writableVaults.some((v) => v.id === vault.id)
        ? vault.id
        : writableVaults[0]?.id) ??
      vault?.id ??
      ''
    setStep('select')
    setTargetVaultId(fallbackId)
    setProviderId('bitwarden')
    setProviderSearch('')
    setFileName('')
    setFileContent('')
    setIsDragging(false)
    setSkipDuplicates(true)
    setFolderAsTag(true)
    setFolderFilter(null)
    setPreviewSearch('')
    setStatusFilter('all')
    setPreview(null)
    setSelectedIndices(new Set())
    setPreviewLoading(false)
    setPreviewError(null)
    setImporting(false)
    setImportResult(null)
  }, [open, vault?.id])

  const selectableVaults = useMemo(() => {
    if (writableVaults.length > 0) return writableVaults
    return vault ? [vault] : []
  }, [writableVaults, vault])

  const activeTargetVault = useMemo(
    () =>
      selectableVaults.find((v) => v.id === targetVaultId) ??
      selectableVaults[0] ??
      vault,
    [selectableVaults, targetVaultId, vault],
  )

  const selectedProviderMeta = useMemo(
    () => getImportProviderMeta(providerId),
    [providerId],
  )

  const filteredProviders = useMemo(() => {
    const query = providerSearch.trim().toLowerCase()
    if (!query) return IMPORT_PROVIDERS
    return IMPORT_PROVIDERS.filter((prov) =>
      [
        prov.name,
        prov.shortDescription,
        prov.formatsLabel,
        ...prov.keywords,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [providerSearch])

  const selectedProviderVisible = useMemo(
    () => filteredProviders.some((p) => p.id === providerId),
    [filteredProviders, providerId],
  )

  const computeDefaultSelected = useCallback(
    (items: ImportPreviewItem[], ignoreDupes: boolean): Set<number> => {
      const next = new Set<number>()
      for (const item of items) {
        if (item.status === 'skipped') continue
        if (ignoreDupes && item.is_duplicate) continue
        next.add(item.index)
      }
      return next
    },
    [],
  )

  const runPreview = useCallback(
    async (params: {
      vaultId: string
      provider: string
      content: string
      filename: string
      useFolderAsTag: boolean
      ignoreDupes: boolean
      advanceStep?: boolean
      preserveSelection?: boolean
    }) => {
      if (!params.vaultId || !params.content.trim()) return
      setPreviewLoading(true)
      setPreviewError(null)
      try {
        const res = await vaultApi.previewVaultImport(params.vaultId, {
          provider: params.provider,
          content: params.content,
          filename: params.filename || undefined,
          folder_as_tag: params.useFolderAsTag,
        })
        setPreview(res)
        setSelectedIndices((prev) => {
          if (!params.preserveSelection) {
            return computeDefaultSelected(res.items, params.ignoreDupes)
          }
          const preserved = new Set<number>()
          for (const item of res.items) {
            if (item.status === 'skipped') continue
            if (params.ignoreDupes && item.is_duplicate) continue
            if (prev.has(item.index)) {
              preserved.add(item.index)
            }
          }
          return preserved
        })
        setFolderFilter((prev) => {
          if (!prev) return null
          if (prev === NO_FOLDER_FILTER && res.has_items_without_folder)
            return prev
          if (res.source_folders.includes(prev)) return prev
          return null
        })
        if (params.advanceStep !== false) {
          setStep('preview')
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Impossibile analizzare il file selezionato'
        setPreviewError(msg)
        setPreview(null)
      } finally {
        setPreviewLoading(false)
      }
    },
    [computeDefaultSelected],
  )

  const handleFilePicked = async (file: File) => {
    setPreviewError(null)
    if (file.size === 0) {
      setPreviewError('Il file selezionato è vuoto.')
      return
    }
    if (file.size > MAX_IMPORT_BYTES) {
      const msg = 'Il file supera il limite massimo consentito di 10 MB.'
      setPreviewError(msg)
      toast.error(msg)
      return
    }

    let text = ''
    try {
      text = await file.text()
    } catch {
      setPreviewError('Impossibile leggere il file selezionato.')
      return
    }

    if (!text.trim()) {
      setPreviewError('Il file selezionato non contiene dati leggibili.')
      return
    }

    setFileName(file.name)
    setFileContent(text)
    await runPreview({
      vaultId: targetVaultId,
      provider: providerId,
      content: text,
      filename: file.name,
      useFolderAsTag: folderAsTag,
      ignoreDupes: skipDuplicates,
      advanceStep: true,
    })
  }

  const handleSelectProvider = (nextProviderId: string) => {
    setProviderId(nextProviderId)
    if (step === 'select' && fileContent) {
      void runPreview({
        vaultId: targetVaultId,
        provider: nextProviderId,
        content: fileContent,
        filename: fileName,
        useFolderAsTag: folderAsTag,
        ignoreDupes: skipDuplicates,
        advanceStep: true,
      })
    }
  }

  const handleTargetVaultChange = (nextVaultId: string) => {
    setTargetVaultId(nextVaultId)
    if (fileContent && (step === 'preview' || previewError)) {
      void runPreview({
        vaultId: nextVaultId,
        provider: providerId,
        content: fileContent,
        filename: fileName,
        useFolderAsTag: folderAsTag,
        ignoreDupes: skipDuplicates,
        advanceStep: step === 'preview' || Boolean(previewError),
      })
    }
  }

  const handleToggleSkipDuplicates = (checked: boolean) => {
    setSkipDuplicates(checked)
    if (!preview) return
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      for (const item of preview.items) {
        if (item.status === 'skipped') continue
        if (item.is_duplicate) {
          if (checked) {
            next.delete(item.index)
          } else {
            next.add(item.index)
          }
        }
      }
      return next
    })
  }

  const handleToggleFolderAsTag = (checked: boolean) => {
    setFolderAsTag(checked)
    if (fileContent && step === 'preview') {
      void runPreview({
        vaultId: targetVaultId,
        provider: providerId,
        content: fileContent,
        filename: fileName,
        useFolderAsTag: checked,
        ignoreDupes: skipDuplicates,
        advanceStep: false,
        preserveSelection: true,
      })
    }
  }

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    let withoutFolder = 0
    if (!preview) return { counts, withoutFolder }
    for (const item of preview.items) {
      if (item.source_folder) {
        counts.set(item.source_folder, (counts.get(item.source_folder) ?? 0) + 1)
      } else {
        withoutFolder += 1
      }
    }
    return { counts, withoutFolder }
  }, [preview])

  const folderScopedItems = useMemo(() => {
    if (!preview) return []
    if (!folderFilter) return preview.items
    if (folderFilter === NO_FOLDER_FILTER) {
      return preview.items.filter((item) => !item.source_folder)
    }
    return preview.items.filter((item) => item.source_folder === folderFilter)
  }, [preview, folderFilter])

  const scopedStats = useMemo(() => {
    let ready = 0
    let warning = 0
    let duplicate = 0
    let skipped = 0
    for (const item of folderScopedItems) {
      if (item.status === 'ready') ready += 1
      else if (item.status === 'warning') warning += 1
      else if (item.status === 'duplicate') duplicate += 1
      else if (item.status === 'skipped') skipped += 1
    }
    return { ready, warning, duplicate, skipped }
  }, [folderScopedItems])

  const visiblePreviewItems = useMemo(() => {
    const q = previewSearch.trim().toLowerCase()
    return folderScopedItems.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (!q) return true
      const hay =
        `${item.title} ${item.username} ${item.url} ${getCategoryLabel(item.category)} ${item.source_folder ?? ''} ${item.tags.join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [folderScopedItems, previewSearch, statusFilter])

  const handleStatusFilter = (status: ImportPreviewItem['status']) => {
    setStatusFilter((prev) => (prev === status ? 'all' : status))
  }

  const isItemSelectable = useCallback(
    (item: ImportPreviewItem) => {
      if (item.status === 'skipped') return false
      if (skipDuplicates && item.is_duplicate) return false
      return true
    },
    [skipDuplicates],
  )

  const selectableScopedCount = useMemo(
    () => folderScopedItems.filter(isItemSelectable).length,
    [folderScopedItems, isItemSelectable],
  )

  const selectableVisibleItems = useMemo(
    () => visiblePreviewItems.filter(isItemSelectable),
    [visiblePreviewItems, isItemSelectable],
  )

  const allVisibleSelected =
    selectableVisibleItems.length > 0 &&
    selectableVisibleItems.every((item) => selectedIndices.has(item.index))

  const handleToggleAllVisible = () => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        for (const item of selectableVisibleItems) {
          next.delete(item.index)
        }
      } else {
        for (const item of selectableVisibleItems) {
          next.add(item.index)
        }
      }
      return next
    })
  }

  const toggleSingleItem = (item: ImportPreviewItem) => {
    if (!isItemSelectable(item)) return
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(item.index)) {
        next.delete(item.index)
      } else {
        next.add(item.index)
      }
      return next
    })
  }

  const effectiveSelectedIndices = useMemo(() => {
    return folderScopedItems
      .filter((item) => isItemSelectable(item) && selectedIndices.has(item.index))
      .map((item) => item.index)
  }, [folderScopedItems, isItemSelectable, selectedIndices])

  const handleConfirmImport = async () => {
    if (!targetVaultId || !fileContent || effectiveSelectedIndices.length === 0) {
      return
    }

    setImporting(true)
    try {
      const result = await vaultApi.importVault(targetVaultId, {
        provider: providerId,
        content: fileContent,
        filename: fileName || undefined,
        duplicate_strategy: skipDuplicates ? 'skip' : 'import_all',
        folder_as_tag: folderAsTag,
        include_source_folders: folderFilter ? [folderFilter] : undefined,
        selected_indices: effectiveSelectedIndices,
      })
      setImportResult(result)
      setStep('result')
      if (result.imported_count > 0) {
        toast.success(
          `Importate ${result.imported_count} credenziali da ${result.provider_label}`,
        )
      } else {
        toast.info('Nessuna nuova credenziale importata')
      }
      await onImported(targetVaultId)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Errore durante l'importazione delle credenziali",
      )
    } finally {
      setImporting(false)
    }
  }

  const handleChangeFile = () => {
    setStep('select')
    setFileName('')
    setFileContent('')
    setPreview(null)
    setPreviewError(null)
    setFolderFilter(null)
    setPreviewSearch('')
    setStatusFilter('all')
    setSelectedIndices(new Set())
  }

  if (!vault && writableVaults.length === 0) return null

  const activePalette = getVaultColor(activeTargetVault?.color ?? 'indigo')

  const statusCards = [
    {
      status: 'ready',
      label: 'Pronte',
      count: scopedStats.ready,
      icon: CheckCircle2,
      cardClass:
        'border-emerald-500/25 bg-emerald-500/10 hover:border-emerald-500/50',
      iconClass: 'text-emerald-600 dark:text-emerald-400',
      valueClass: 'text-emerald-600 dark:text-emerald-400',
      activeClass:
        'aria-pressed:border-emerald-500/60 aria-pressed:ring-2 aria-pressed:ring-emerald-500/60',
    },
    {
      status: 'warning',
      label: 'Con avvisi',
      count: scopedStats.warning,
      icon: AlertTriangle,
      cardClass:
        'border-amber-500/25 bg-amber-500/10 hover:border-amber-500/50',
      iconClass: 'text-amber-600 dark:text-amber-400',
      valueClass: 'text-amber-600 dark:text-amber-400',
      activeClass:
        'aria-pressed:border-amber-500/60 aria-pressed:ring-2 aria-pressed:ring-amber-500/60',
    },
    {
      status: 'duplicate',
      label: 'Duplicati',
      count: scopedStats.duplicate,
      icon: Copy,
      cardClass: 'border-sky-500/25 bg-sky-500/10 hover:border-sky-500/50',
      iconClass: 'text-sky-600 dark:text-sky-400',
      valueClass: 'text-sky-600 dark:text-sky-400',
      activeClass:
        'aria-pressed:border-sky-500/60 aria-pressed:ring-2 aria-pressed:ring-sky-500/60',
    },
    {
      status: 'skipped',
      label: 'Saltate',
      count: scopedStats.skipped,
      icon: Ban,
      cardClass: 'border-border/70 bg-muted/40 hover:border-muted-foreground/40',
      iconClass: 'text-muted-foreground',
      valueClass: 'text-muted-foreground',
      activeClass:
        'aria-pressed:border-muted-foreground/50 aria-pressed:ring-2 aria-pressed:ring-muted-foreground/40',
    },
  ] as const

  const renderTargetVaultSelect = (options?: {
    id?: string
    triggerClassName?: string
  }) => (
    <Select
      value={targetVaultId}
      onValueChange={handleTargetVaultChange}
      disabled={previewLoading || importing || selectableVaults.length === 0}
    >
      <SelectTrigger
        id={options?.id}
        className={cn('text-xs', options?.triggerClassName)}
      >
        <SelectValue placeholder="Seleziona cartella" />
      </SelectTrigger>
      <SelectContent position="popper">
        {selectableVaults.map((v) => {
          const vp = getVaultColor(v.color)
          const contextLabel =
            v.owner_group_name ?? (v.is_shared_with_me ? 'Condivisa' : null)
          return (
            <SelectItem key={v.id} value={v.id}>
              <span className="flex min-w-0 items-center gap-2">
                <VaultIcon
                  icon={getVaultDisplayIcon(v)}
                  className={cn('size-3.5 shrink-0', vp.text)}
                />
                <span className="truncate">{v.name}</span>
                {contextLabel && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    ({contextLabel})
                  </span>
                )}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && importing) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-5 text-primary sync-security:text-[#ff9c00]" />
            Importa credenziali nella cartella
          </DialogTitle>
          <DialogDescription>
            {step === 'select' &&
              'Seleziona la cartella di destinazione, scegli il provider di origine e carica il file esportato.'}
            {step === 'preview' &&
              'Controlla l’anteprima, gestisci eventuali duplicati e conferma le voci da cifrare e importare.'}
            {step === 'result' &&
              'Riepilogo dell’importazione completata nella cartella selezionata.'}
          </DialogDescription>
        </DialogHeader>

        {/* Pinned Destination Folder Dropdown & Provider Search (Step 1) */}
        {step === 'select' && (
          <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="import-target-vault"
                className="text-xs font-medium text-muted-foreground"
              >
                Cartella di destinazione
              </Label>
              {renderTargetVaultSelect({
                id: 'import-target-vault',
                triggerClassName: 'h-9 w-full',
              })}
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="import-provider-search"
                className="text-xs font-medium text-muted-foreground"
              >
                Cerca provider
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="import-provider-search"
                  placeholder="Cerca provider, browser o formato..."
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                  className="h-9 pr-8 pl-8 text-xs"
                />
                {providerSearch && (
                  <button
                    type="button"
                    onClick={() => setProviderSearch('')}
                    aria-label="Cancella ricerca provider"
                    className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-xs p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Compact Destination Folder Bar (Step 2) */}
        {step === 'preview' && activeTargetVault && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/35 px-3 py-2 sync-security:border-white/15 sync-security:bg-[#000c20]/60">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <VaultIcon
                icon={getVaultDisplayIcon(activeTargetVault)}
                className={cn('size-3.5 shrink-0', activePalette.text)}
              />
              <span>Cartella di destinazione:</span>
            </div>

            {renderTargetVaultSelect({
              triggerClassName: 'h-8 w-56',
            })}
          </div>
        )}

        {/* STEP 1: Select Provider & File */}
        {step === 'select' && (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-[1.25fr_1fr]">
            {/* Supported Providers Grid */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Provider supportati
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  {providerSearch.trim()
                    ? `${filteredProviders.length} di ${IMPORT_PROVIDERS.length}`
                    : `${IMPORT_PROVIDERS.length} provider`}
                  {providerSearch.trim() && !selectedProviderVisible
                    ? ` · Selezionato: ${selectedProviderMeta.name}`
                    : ''}
                </span>
              </div>

              {filteredProviders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-7 text-center">
                  <p className="text-xs font-medium text-foreground">
                    Nessun provider trovato per &ldquo;{providerSearch.trim()}
                    &rdquo;.
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Prova un altro termine oppure importa tramite CSV Generico.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setProviderSearch('')}
                    >
                      Cancella filtro
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => {
                        handleSelectProvider('generic_csv')
                        setProviderSearch('')
                      }}
                    >
                      Usa CSV Generico
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="max-h-[268px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {filteredProviders.map((prov) => {
                      const active = providerId === prov.id
                      return (
                        <button
                          key={prov.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => handleSelectProvider(prov.id)}
                          className={cn(
                            'group flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-all',
                            active
                              ? 'border-primary bg-accent/65 ring-1 ring-primary/30 shadow-xs sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00]/12 sync-security:ring-[#ff9c00]/40'
                              : 'border-border/70 bg-card/45 hover:border-border hover:bg-card/90',
                          )}
                        >
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/90 p-1.5 shadow-2xs dark:border-white/10 dark:bg-white/[0.05] sync-security:border-white/15 sync-security:bg-[#000c20]/80">
                            <ImportProviderIcon
                              providerId={prov.id}
                              className="size-7"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className="text-[13px] font-semibold leading-tight text-foreground">
                                  {prov.name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="h-4 shrink-0 px-1.5 py-0 font-mono text-[9px] leading-none"
                                >
                                  {prov.formatsLabel}
                                </Badge>
                              </div>

                              <div
                                className={cn(
                                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                                  active
                                    ? 'border-primary bg-primary text-primary-foreground sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b]'
                                    : 'border-muted-foreground/35',
                                )}
                              >
                                {active && <Check className="size-2.5" />}
                              </div>
                            </div>

                            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                              {prov.shortDescription}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3.5">
            {/* Contextual Export Guide */}
            <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground sync-security:border-white/15 sync-security:bg-[#000c20]/65">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/90 p-1 dark:border-white/10 dark:bg-white/[0.05] sync-security:border-white/15 sync-security:bg-[#000c20]/80">
                <ImportProviderIcon
                  providerId={selectedProviderMeta.id}
                  className="size-4.5"
                />
              </div>
              <div>
                <span className="font-semibold text-foreground">
                  Come esportare da {selectedProviderMeta.name}:{' '}
                </span>
                {selectedProviderMeta.exportGuide}
              </div>
            </div>

            {/* File Dropzone */}
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={selectedProviderMeta.accept}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) {
                    void handleFilePicked(file)
                  }
                }}
              />

              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragging(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) {
                    void handleFilePicked(file)
                  }
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-5 text-center transition-colors',
                  isDragging
                    ? 'border-primary bg-accent/60 sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00]/10'
                    : 'border-border/80 bg-card/30 hover:border-primary/60 hover:bg-card/60 sync-security:border-white/25 sync-security:hover:border-[#ff9c00]',
                )}
              >
                {previewLoading ? (
                  <>
                    <Loader2 className="size-7 animate-spin text-primary sync-security:text-[#ff9c00]" />
                    <p className="mt-2.5 text-sm font-medium text-foreground">
                      Analisi di {fileName || 'file'} in corso...
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Verifica formato, categorie e controllo duplicati nella
                      cartella.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex size-11 items-center justify-center rounded-full bg-muted text-foreground sync-security:bg-[#ff9c00]/20 sync-security:text-[#ff9c00]">
                      <FileUp className="size-5" />
                    </div>
                    <p className="mt-2.5 text-sm font-semibold text-foreground">
                      Trascina qui il file {selectedProviderMeta.formatsLabel} o
                      clicca per scegliere
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Formati accettati per {selectedProviderMeta.name}:{' '}
                      {selectedProviderMeta.formatsLabel} · max 10 MB · cifratura
                      AES-256-GCM immediata al salvataggio
                    </p>
                    {fileName && !previewError && (
                      <Badge
                        variant="secondary"
                        className="mt-2.5 gap-1.5 text-xs"
                      >
                        <ImportProviderIcon
                          providerId={selectedProviderMeta.id}
                          className="size-3.5"
                        />
                        {fileName}
                      </Badge>
                    )}
                  </>
                )}
              </div>

              {previewError && (
                <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-semibold">
                      Impossibile analizzare il file
                      {fileName ? ` "${fileName}"` : ''}
                    </p>
                    <p className="leading-relaxed text-destructive/90">
                      {previewError}
                    </p>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        )}

        {/* STEP 2: Preview & Options */}
        {step === 'preview' && preview && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* File & Format Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-card/50 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                {preview.detected_format === 'JSON' ? (
                  <FileCode2 className="size-4 shrink-0 text-sky-500 sync-security:text-[#ff9c00]" />
                ) : (
                  <FileSpreadsheet className="size-4 shrink-0 text-emerald-500 sync-security:text-[#ff9c00]" />
                )}
                <span className="truncate text-xs font-semibold text-foreground">
                  {fileName || 'Export'}
                </span>
                <Badge
                  variant="secondary"
                  className="gap-1 px-1.5 py-0 text-[10px]"
                >
                  <ImportProviderIcon
                    providerId={preview.provider}
                    className="size-3.5"
                  />
                  {preview.provider_label}
                </Badge>
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 font-mono text-[10px]"
                >
                  {preview.detected_format}
                </Badge>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-7 gap-1 text-xs"
                onClick={handleChangeFile}
                disabled={importing}
              >
                <ArrowLeft className="size-3" />
                Cambia file
              </Button>
            </div>

            {/* 4 Summary Badges: clicca un riquadro per filtrare la lista */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {statusCards.map((card) => {
                const Icon = card.icon
                return (
                  <button
                    key={card.status}
                    type="button"
                    aria-pressed={statusFilter === card.status}
                    title={`Mostra solo: ${card.label}`}
                    onClick={() => handleStatusFilter(card.status)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                      card.cardClass,
                      card.activeClass,
                    )}
                  >
                    <Icon className={cn('size-4 shrink-0', card.iconClass)} />
                    <span className="block">
                      <span
                        className={cn(
                          'block text-base font-bold leading-none',
                          card.valueClass,
                        )}
                      >
                        {card.count}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {card.label}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Options & Source Folder Filter */}
            <div className="space-y-2.5 rounded-lg border border-border/70 bg-card/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="skip-duplicates"
                    checked={skipDuplicates}
                    onCheckedChange={handleToggleSkipDuplicates}
                    disabled={importing}
                  />
                  <Copy className="size-3.5 text-muted-foreground" />
                  <Label
                    htmlFor="skip-duplicates"
                    className="cursor-pointer text-xs font-medium"
                  >
                    Ignora duplicati già presenti nella cartella
                  </Label>
                </div>

                {preview.source_folders.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="folder-as-tag"
                      checked={folderAsTag}
                      onCheckedChange={handleToggleFolderAsTag}
                      disabled={importing || previewLoading}
                    />
                    <Tag className="size-3.5 text-muted-foreground" />
                    <Label
                      htmlFor="folder-as-tag"
                      className="cursor-pointer text-xs font-medium"
                    >
                      Aggiungi cartella di origine come tag
                    </Label>
                  </div>
                )}
              </div>

              {preview.source_folders.length > 0 && (
                <div className="space-y-1.5 border-t border-border/50 pt-2">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Filtra per cartella / collezione nel file esportato:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFolderFilter(null)}
                      className={cn(
                        'inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors',
                        folderFilter === null
                          ? 'border-primary bg-primary text-primary-foreground sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b]'
                          : 'border-border/70 bg-background/60 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Layers className="size-3" />
                      <span>Tutte ({preview.total_parsed})</span>
                    </button>

                    {preview.has_items_without_folder && (
                      <button
                        type="button"
                        onClick={() =>
                          setFolderFilter((prev) =>
                            prev === NO_FOLDER_FILTER ? null : NO_FOLDER_FILTER,
                          )
                        }
                        className={cn(
                          'inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors',
                          folderFilter === NO_FOLDER_FILTER
                            ? 'border-primary bg-primary text-primary-foreground sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b]'
                            : 'border-border/70 bg-background/60 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <FolderOpen className="size-3" />
                        <span>Senza cartella ({folderCounts.withoutFolder})</span>
                      </button>
                    )}

                    {preview.source_folders.map((fname) => (
                      <button
                        key={fname}
                        type="button"
                        onClick={() =>
                          setFolderFilter((prev) =>
                            prev === fname ? null : fname,
                          )
                        }
                        className={cn(
                          'inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors',
                          folderFilter === fname
                            ? 'border-primary bg-primary text-primary-foreground sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b]'
                            : 'border-border/70 bg-background/60 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Folder className="size-3" />
                        <span className="max-w-36 truncate">{fname}</span>
                        <span>({folderCounts.counts.get(fname) ?? 0})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Preview Search & Select All Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative min-w-44 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cerca nell'anteprima..."
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <span className="shrink-0 text-[11px] text-muted-foreground">
                {effectiveSelectedIndices.length} di {selectableScopedCount}{' '}
                selezionate
              </span>

              <Button
                type="button"
                variant="outline"
                size="xs"
                className="h-8 gap-1.5 text-xs"
                disabled={selectableVisibleItems.length === 0 || importing}
                onClick={handleToggleAllVisible}
              >
                <span
                  className={cn(
                    'flex size-3.5 items-center justify-center rounded border',
                    allVisibleSelected
                      ? 'border-primary bg-primary text-primary-foreground sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00] sync-security:text-[#000c20]'
                      : 'border-muted-foreground/50',
                  )}
                >
                  {allVisibleSelected && <Check className="size-2.5" />}
                </span>
                {allVisibleSelected ? 'Deseleziona tutte' : 'Seleziona tutte'}
              </Button>
            </div>

            {/* Preview Item List */}
            <ScrollArea
              className="h-72 rounded-lg border border-border/70 bg-card/25"
              scrollBarClassName={importScrollBarClass}
              thumbClassName={importScrollThumbClass}
            >
              {visiblePreviewItems.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
                  <span>Nessuna credenziale corrisponde ai filtri selezionati.</span>
                  {statusFilter !== 'all' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setStatusFilter('all')}
                    >
                      <X className="size-3" />
                      Mostra tutti gli stati
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {visiblePreviewItems.map((item) => {
                    const selectable = isItemSelectable(item)
                    const checked =
                      selectable && selectedIndices.has(item.index)

                    return (
                      <div
                        key={item.index}
                        role={selectable ? 'button' : undefined}
                        tabIndex={selectable ? 0 : undefined}
                        onClick={() => selectable && toggleSingleItem(item)}
                        onKeyDown={(e) => {
                          if (
                            selectable &&
                            (e.key === 'Enter' || e.key === ' ')
                          ) {
                            e.preventDefault()
                            toggleSingleItem(item)
                          }
                        }}
                        className={cn(
                          'flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors',
                          selectable
                            ? 'cursor-pointer hover:bg-muted/40'
                            : 'opacity-65',
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={cn(
                              'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                              !selectable
                                ? 'border-border/60 bg-muted/50'
                                : checked
                                  ? 'border-primary bg-primary text-primary-foreground sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00] sync-security:text-[#000c20]'
                                  : 'border-muted-foreground/40 bg-background',
                            )}
                          >
                            {checked && <Check className="size-3" />}
                          </span>

                          <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/40 text-muted-foreground">
                            <CategoryIcon
                              category={item.category}
                              className="size-3.5"
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-xs font-semibold text-foreground">
                                {item.title}
                              </span>
                              {item.favorite && (
                                <Star
                                  className="size-3 shrink-0 fill-amber-400 text-amber-400"
                                  aria-label="Preferita"
                                />
                              )}
                              <Badge
                                variant="outline"
                                className="px-1 py-0 text-[9px]"
                              >
                                {getCategoryLabel(item.category)}
                              </Badge>
                              {item.source_folder && (
                                <Badge
                                  variant="secondary"
                                  className="gap-1 px-1.5 py-0 text-[9px]"
                                >
                                  <Folder className="size-2.5" />
                                  {item.source_folder}
                                </Badge>
                              )}
                            </div>

                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {[item.username, item.url]
                                .filter(Boolean)
                                .join(' · ') ||
                                (item.extra_field_count > 0
                                  ? item.extra_field_count === 1
                                    ? '1 campo strutturato'
                                    : `${item.extra_field_count} campi strutturati`
                                  : item.has_notes
                                    ? 'Contiene note cifrate'
                                    : 'Nessun dettaglio aggiuntivo')}
                            </p>

                            {item.warning && (
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="size-3 shrink-0" />
                                <span>{item.warning}</span>
                              </p>
                            )}
                            {item.skip_reason && (
                              <p className="mt-0.5 text-[11px] text-destructive">
                                Saltata: {item.skip_reason}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0">
                          {item.status === 'ready' && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0 text-[10px] text-emerald-600 dark:text-emerald-400"
                            >
                              <CheckCircle2 className="size-2.5" />
                              Pronta
                            </Badge>
                          )}
                          {item.status === 'warning' && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-500/35 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400"
                            >
                              <AlertTriangle className="size-2.5" />
                              Avviso
                            </Badge>
                          )}
                          {item.status === 'duplicate' && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-sky-500/35 bg-sky-500/10 px-1.5 py-0 text-[10px] text-sky-600 dark:text-sky-400"
                            >
                              <Copy className="size-2.5" />
                              Duplicato
                            </Badge>
                          )}
                          {item.status === 'skipped' && (
                            <Badge
                              variant="outline"
                              className="gap-1 px-1.5 py-0 text-[10px] text-muted-foreground"
                            >
                              <Ban className="size-2.5" />
                              Saltata
                            </Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* STEP 3: Result Summary */}
        {step === 'result' && importResult && (
          <div className="flex-1 space-y-4 overflow-y-auto py-2 pr-1">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-500" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-foreground">
                    Importazione completata da {importResult.provider_label} (
                    {importResult.detected_format})
                  </p>
                  <span className="inline-flex size-7 items-center justify-center rounded-md border border-border/70 bg-background/70 p-1 text-foreground">
                    <ImportProviderIcon
                      providerId={importResult.provider}
                      className="size-4.5"
                    />
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Tutte le credenziali importate sono state cifrate a riposo con
                  AES-256-GCM nella cartella{' '}
                  <strong className="text-foreground">
                    {activeTargetVault?.name ?? 'selezionata'}
                  </strong>
                  .
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-center">
                <div className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  <p className="text-lg font-bold leading-none">
                    {importResult.imported_count}
                  </p>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Importate
                </p>
              </div>
              <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-3.5 py-2.5 text-center">
                <div className="flex items-center justify-center gap-1.5 text-sky-600 dark:text-sky-400">
                  <Copy className="size-4" />
                  <p className="text-lg font-bold leading-none">
                    {importResult.duplicate_skipped_count}
                  </p>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Duplicati ignorati
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/40 px-3.5 py-2.5 text-center">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                  <Ban className="size-4" />
                  <p className="text-lg font-bold leading-none">
                    {importResult.invalid_skipped_count}
                  </p>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Voci saltate
                </p>
              </div>
            </div>

            {importResult.skipped_items.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Dettaglio elementi non importati (
                  {importResult.skipped_items.length})
                </Label>
                <ScrollArea
                  className="h-40 rounded-lg border border-border/70 bg-card/30 p-2.5"
                  scrollBarClassName={importScrollBarClass}
                  thumbClassName={importScrollThumbClass}
                >
                  <div className="space-y-1.5">
                    {importResult.skipped_items.map((sk) => (
                      <div
                        key={`${sk.index}-${sk.title}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs"
                      >
                        <span className="truncate font-medium text-foreground">
                          {sk.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {sk.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="border-t pt-3">
          {step === 'select' && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Annulla
              </Button>
              {preview && !previewError ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={previewLoading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    Cambia file
                  </Button>
                  <Button
                    type="button"
                    disabled={previewLoading}
                    onClick={() => setStep('preview')}
                  >
                    Torna all&apos;anteprima
                    <ArrowRight className="size-4" />
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  disabled={previewLoading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4" />
                  Seleziona file…
                </Button>
              )}
            </>
          )}

          {step === 'preview' && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('select')}
                disabled={importing}
              >
                Indietro
              </Button>
              <Button
                type="button"
                disabled={
                  importing ||
                  previewLoading ||
                  effectiveSelectedIndices.length === 0
                }
                onClick={handleConfirmImport}
              >
                {importing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Importazione in corso...
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
                    Importa {effectiveSelectedIndices.length}{' '}
                    {effectiveSelectedIndices.length === 1
                      ? 'credenziale'
                      : 'credenziali'}
                  </>
                )}
              </Button>
            </>
          )}

          {step === 'result' && (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Chiudi e apri cartella
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
