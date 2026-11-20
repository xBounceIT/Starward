import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpDown,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Folder,
  History,
  KeyRound,
  LayoutGrid,
  Layers,
  List,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Share2,
  Star,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { VaultSelection } from '@/components/app-sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CategoryIcon,
  CredentialBrandIcon,
  VaultIcon,
} from '@/components/vault-icon'
import type { Credential, Vault } from '@/lib/api'
import {
  CREDENTIAL_CATEGORIES,
  getCategoryLabel,
  getCredentialListColumns,
  getCredentialQuickCopy,
} from '@/lib/credential-types'
import { cn } from '@/lib/utils'
import {
  formatModifiedRelative,
  getInitials,
  getVaultColor,
} from '@/lib/vault-utils'

export type CredentialSortOption =
  | 'updated_desc'
  | 'created_desc'
  | 'title_asc'
  | 'title_desc'

const SORT_OPTIONS: { value: CredentialSortOption; label: string }[] = [
  { value: 'updated_desc', label: 'Ultima modifica' },
  { value: 'created_desc', label: 'Aggiunte di recente' },
  { value: 'title_asc', label: 'Titolo (A-Z)' },
  { value: 'title_desc', label: 'Titolo (Z-A)' },
]

export interface CredentialListStats {
  total: number
  favorites: number
  vaults: number
  recent: number
}

interface CredentialListProps {
  selection: VaultSelection
  activeVault: Vault | null
  credentials: Credential[]
  stats: CredentialListStats
  selectedCredentialId: string | null
  searchQuery: string
  categoryFilter: string
  sortBy: CredentialSortOption
  loading: boolean
  onSearchChange: (q: string) => void
  onCategoryFilterChange: (cat: string) => void
  onSortChange: (sort: CredentialSortOption) => void
  onSelectCredential: (cred: Credential) => void
  onToggleFavorite: (cred: Credential) => void
  onEditCredential: (cred: Credential) => void
  onDeleteCredential: (cred: Credential) => void
  onNewCredential: () => void
  onShareVault: (vault: Vault) => void
  onEditVault: (vault: Vault) => void
  onDeleteVault: (vault: Vault) => void
  onOpenAudit: (vault: Vault) => void
}

export function CredentialList({
  selection,
  activeVault,
  credentials,
  stats,
  selectedCredentialId,
  searchQuery,
  categoryFilter,
  sortBy,
  loading,
  onSearchChange,
  onCategoryFilterChange,
  onSortChange,
  onSelectCredential,
  onToggleFavorite,
  onEditCredential,
  onDeleteCredential,
  onNewCredential,
  onShareVault,
  onEditVault,
  onDeleteVault,
  onOpenAudit,
}: CredentialListProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const categoryScrollRef = useRef<HTMLDivElement>(null)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [openMenuCredId, setOpenMenuCredId] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const el = categoryScrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (
        el.scrollWidth > el.clientWidth &&
        Math.abs(e.deltaY) > Math.abs(e.deltaX)
      ) {
        e.preventDefault()
        const delta =
          e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY
        el.scrollLeft += delta
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const copyQuick = async (
    e: React.MouseEvent,
    text: string,
    label: string,
  ) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copiato negli appunti`)
    } catch {
      toast.error('Impossibile copiare negli appunti')
    }
  }

  const headerTitle =
    selection.type === 'all'
      ? 'Tutte le credenziali'
      : selection.type === 'favorites'
        ? 'Preferiti'
        : (activeVault?.name ?? 'Cartella')

  const headerSubtitle =
    selection.type === 'all'
      ? 'Tutte le tue credenziali in un unico posto, ordinate e sempre accessibili.'
      : selection.type === 'favorites'
        ? 'Accesso rapido alle credenziali principali contrassegnate come preferite.'
        : activeVault?.description ||
          (activeVault?.is_shared_with_me
            ? `Cartella condivisa da ${activeVault.owner_name}`
            : 'Tutte le tue credenziali archiviate in questa cartella.')

  const canCreateInCurrent =
    !activeVault ||
    activeVault.role === 'owner' ||
    activeVault.role === 'editor'

  const currentSortLabel =
    SORT_OPTIONS.find((s) => s.value === sortBy)?.label ?? 'Ultima modifica'

  const renderRowMenu = (cred: Credential) => {
    const quickCopy = getCredentialQuickCopy(cred)
    const canWrite =
      cred.vault_role === 'owner' || cred.vault_role === 'editor'
    const normalizedUrl = cred.url
      ? /^https?:\/\//i.test(cred.url)
        ? cred.url
        : `https://${cred.url}`
      : ''

    return (
      <DropdownMenu
        open={openMenuCredId === cred.id}
        onOpenChange={(open) => setOpenMenuCredId(open ? cred.id : null)}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
            aria-label="Azioni credenziale"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
          onClick={(e) => e.stopPropagation()}
        >
          {quickCopy.primary && (
            <DropdownMenuItem
              onClick={(e) =>
                copyQuick(
                  e,
                  quickCopy.primary!.value,
                  quickCopy.primary!.label,
                )
              }
            >
              <User className="size-4" />
              Copia {quickCopy.primary.label.toLowerCase()}
            </DropdownMenuItem>
          )}
          {quickCopy.secondary && (
            <DropdownMenuItem
              onClick={(e) =>
                copyQuick(
                  e,
                  quickCopy.secondary!.value,
                  quickCopy.secondary!.label,
                )
              }
            >
              <Copy className="size-4" />
              Copia {quickCopy.secondary.label.toLowerCase()}
            </DropdownMenuItem>
          )}
          {normalizedUrl && (
            <DropdownMenuItem asChild>
              <a href={normalizedUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Apri URL
              </a>
            </DropdownMenuItem>
          )}
          {canWrite && (
            <>
              {(quickCopy.primary || quickCopy.secondary || normalizedUrl) && (
                <DropdownMenuSeparator />
              )}
              <DropdownMenuItem onClick={() => onEditCredential(cred)}>
                <Pencil className="size-4" />
                Modifica
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDeleteCredential(cred)}
              >
                <Trash2 className="size-4" />
                Elimina
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {/* Top Workspace Header & Controls */}
      <div className="space-y-4 px-5 pt-5 pb-3 sm:px-6">
        {/* Title & Vault Actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <SidebarTrigger className="-ml-1 hidden shrink-0 md:inline-flex lg:hidden" />
              {selection.type === 'all' ? (
                <Layers className="size-5 shrink-0 text-muted-foreground" />
              ) : selection.type === 'favorites' ? (
                <Star className="size-5 shrink-0 fill-amber-400 text-amber-400" />
              ) : activeVault ? (
                <VaultIcon
                  icon={activeVault.icon}
                  className={cn(
                    'size-5 shrink-0',
                    getVaultColor(activeVault.color).text,
                  )}
                />
              ) : null}
              <h2 className="truncate text-xl font-bold tracking-tight">
                {headerTitle}
              </h2>
              {activeVault?.is_shared_with_me && (
                <Badge variant="secondary" className="text-[10px]">
                  {activeVault.role === 'editor' ? 'Editor' : 'Sola lettura'}
                </Badge>
              )}
            </div>
            <p className="mt-1 truncate pl-7 text-xs text-muted-foreground">
              {headerSubtitle}
            </p>
          </div>

          {activeVault && (
            <div className="flex shrink-0 items-center gap-1.5">
              {activeVault.is_shared && (
                <div className="mr-1 hidden items-center -space-x-1.5 sm:flex">
                  {activeVault.members.slice(0, 3).map((m) => (
                    <Avatar
                      key={m.id}
                      className="size-6 ring-2 ring-background"
                    >
                      <AvatarFallback className="text-[10px]">
                        {getInitials(m.name || m.email)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              )}
              <Button
                variant={activeVault.is_shared ? 'secondary' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 rounded-lg text-xs"
                onClick={() => onShareVault(activeVault)}
              >
                {activeVault.is_shared ? (
                  <Users className="size-3.5" />
                ) : (
                  <Share2 className="size-3.5" />
                )}
                {activeVault.role === 'owner'
                  ? 'Condividi'
                  : `Membri (${activeVault.member_count})`}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="rounded-lg">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {canCreateInCurrent && (
                    <DropdownMenuItem onClick={onNewCredential}>
                      <Plus className="size-4" />
                      Nuova credenziale
                    </DropdownMenuItem>
                  )}
                  {activeVault.role === 'owner' && (
                    <DropdownMenuItem onClick={() => onEditVault(activeVault)}>
                      <Pencil className="size-4" />
                      Rinomina
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onShareVault(activeVault)}>
                    {activeVault.role === 'owner' ? (
                      <>
                        <Share2 className="size-4" />
                        Condividi
                      </>
                    ) : (
                      <>
                        <Users className="size-4" />
                        Membri ({activeVault.member_count})
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpenAudit(activeVault)}>
                    <History className="size-4" />
                    Registro attività
                  </DropdownMenuItem>
                  {activeVault.role === 'owner' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={activeVault.is_personal}
                        onClick={() => {
                          if (!activeVault.is_personal)
                            onDeleteVault(activeVault)
                        }}
                      >
                        <Trash2 className="size-4" />
                        Cancella
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]">
              <KeyRound className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {stats.total}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Credenziali totali
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Star className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {stats.favorites}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Preferiti
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
              <Folder className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {stats.vaults}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Cartelle
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Clock className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {stats.recent}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Aggiunte di recente
              </p>
            </div>
          </div>
        </div>

        {/* Search, Sort & View Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Cerca titolo, username, URL..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-10 rounded-xl border-border/70 bg-card/50 pr-24 pl-10 text-sm"
            />
            <div className="absolute top-1/2 right-2.5 flex -translate-y-1/2 items-center gap-1.5">
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onSearchChange('')}
                  className="size-6 text-muted-foreground hover:text-foreground"
                  aria-label="Cancella ricerca"
                >
                  <X className="size-3.5" />
                </Button>
              )}
              <kbd className="pointer-events-none hidden rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 font-sans text-[11px] font-medium text-muted-foreground sm:inline-block">
                Ctrl + K
              </kbd>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 rounded-xl border-border/70 bg-card/50 px-3.5 text-xs font-medium hover:bg-card"
              >
                <ArrowUpDown className="size-3.5 text-muted-foreground" />
                <span>{currentSortLabel}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => onSortChange(opt.value)}
                  className={cn(
                    sortBy === opt.value && 'bg-accent font-medium',
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex h-10 items-center gap-0.5 rounded-xl border border-border/70 bg-card/50 p-1">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title="Vista lista"
              aria-label="Vista lista"
              className={cn(
                'flex size-8 items-center justify-center rounded-lg transition-colors',
                viewMode === 'list'
                  ? 'bg-accent text-accent-foreground shadow-xs ring-1 ring-border sync-security:bg-[#ff9c00]/20 sync-security:text-[#ff9c00] sync-security:ring-[#ff9c00]/40'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <List className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Vista griglia"
              aria-label="Vista griglia"
              className={cn(
                'flex size-8 items-center justify-center rounded-lg transition-colors',
                viewMode === 'grid'
                  ? 'bg-accent text-accent-foreground shadow-xs ring-1 ring-border sync-security:bg-[#ff9c00]/20 sync-security:text-[#ff9c00] sync-security:ring-[#ff9c00]/40'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
        </div>

        {/* Category Filter Pills & Total Count */}
        <div className="flex items-center justify-between gap-3">
          <div
            ref={categoryScrollRef}
            className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              type="button"
              onClick={() => onCategoryFilterChange('')}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs transition-colors',
                categoryFilter === ''
                  ? 'bg-foreground font-semibold text-background shadow-xs sync-security:bg-[#ff9c00] sync-security:text-[#000c20]'
                  : 'border border-border/70 bg-card/40 font-medium text-muted-foreground hover:bg-card hover:text-foreground',
              )}
            >
              Tutte
            </button>
            {CREDENTIAL_CATEGORIES.map((cat) => {
              const active = categoryFilter === cat.value
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() =>
                    onCategoryFilterChange(active ? '' : cat.value)
                  }
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs transition-colors',
                    active
                      ? 'bg-foreground font-semibold text-background shadow-xs sync-security:bg-[#ff9c00] sync-security:text-[#000c20]'
                      : 'border border-border/70 bg-card/40 font-medium text-muted-foreground hover:bg-card hover:text-foreground',
                  )}
                >
                  <CategoryIcon category={cat.value} className="size-3.5" />
                  <span>{cat.label}</span>
                </button>
              )
            })}
          </div>

          <span className="shrink-0 text-xs text-muted-foreground">
            {credentials.length}{' '}
            {credentials.length === 1 ? 'credenziale' : 'credenziali'}
          </span>
        </div>
      </div>

      {/* Credential Items */}
      <ScrollArea className="min-h-0 flex-1 px-5 pb-5 sm:px-6">
        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-xl border border-border/60 bg-card/40 px-4 py-3"
              >
                <Skeleton className="size-10 shrink-0 rounded-xl" />
                <div className="w-40 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <div className="hidden flex-1 space-y-2 sm:block">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="hidden h-3 w-24 md:block" />
              </div>
            ))}
          </div>
        ) : credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/20 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]">
              <KeyRound className="size-6" />
            </div>
            <p className="mt-3 text-sm font-semibold">
              Nessuna credenziale trovata
            </p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              {searchQuery || categoryFilter
                ? 'Prova a modificare la ricerca o i filtri per categoria.'
                : 'Aggiungi la prima credenziale in questa cartella per iniziare.'}
            </p>
            {canCreateInCurrent && !searchQuery && !categoryFilter && (
              <Button
                size="sm"
                className="mt-4 rounded-lg"
                onClick={onNewCredential}
              >
                <Plus className="size-4" />
                Aggiungi credenziale
              </Button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {credentials.map((cred) => {
              const isSelected = cred.id === selectedCredentialId
              const cols = getCredentialListColumns(cred)
              const canWrite =
                cred.vault_role === 'owner' || cred.vault_role === 'editor'

              return (
                <div
                  key={cred.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectCredential(cred)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setOpenMenuCredId(cred.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectCredential(cred)
                    }
                  }}
                  className={cn(
                    'group relative flex cursor-pointer flex-col justify-between gap-3 rounded-xl border p-4 text-left transition-all',
                    isSelected
                      ? 'border-primary/60 bg-accent/70 shadow-xs ring-1 ring-ring/30 sync-security:border-[#ff9c00]/70 sync-security:bg-[#ff9c00]/[0.08] sync-security:ring-0 sync-security:shadow-[0_0_0_1px_rgba(255,156,0,0.2)]'
                      : 'border-border/70 bg-card/45 hover:border-border hover:bg-card/80',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <CredentialBrandIcon
                        credential={cred}
                        className="size-10 rounded-xl"
                        iconClassName="size-5"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {cred.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {getCategoryLabel(cred.category)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="size-7"
                        disabled={!canWrite}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (canWrite) onToggleFavorite(cred)
                        }}
                        title={
                          cred.favorite
                            ? 'Rimuovi dai preferiti'
                            : 'Aggiungi ai preferiti'
                        }
                      >
                        <Star
                          className={cn(
                            'size-4 transition-colors',
                            cred.favorite
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-muted-foreground/70 hover:text-amber-400',
                          )}
                        />
                      </Button>
                      {renderRowMenu(cred)}
                    </div>
                  </div>

                  <div className="min-w-0 space-y-0.5 border-t border-border/50 pt-2.5">
                    <p className="truncate text-xs font-medium text-foreground/90">
                      {cols.primary}
                    </p>
                    {cols.secondary && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {cols.secondary}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="truncate">{cred.vault_name}</span>
                    <span className="shrink-0">
                      {formatModifiedRelative(cred.updated_at)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {credentials.map((cred) => {
              const isSelected = cred.id === selectedCredentialId
              const cols = getCredentialListColumns(cred)
              const canWrite =
                cred.vault_role === 'owner' || cred.vault_role === 'editor'

              return (
                <div
                  key={cred.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectCredential(cred)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setOpenMenuCredId(cred.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectCredential(cred)
                    }
                  }}
                  className={cn(
                    'group relative flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all',
                    isSelected
                      ? 'border-primary/60 bg-accent/70 shadow-xs ring-1 ring-ring/30 sync-security:border-[#ff9c00]/70 sync-security:bg-[#ff9c00]/[0.08] sync-security:ring-0 sync-security:shadow-[0_0_0_1px_rgba(255,156,0,0.2)]'
                      : 'border-border/70 bg-card/45 hover:border-border hover:bg-card/80',
                  )}
                >
                  <CredentialBrandIcon
                    credential={cred}
                    className="size-10 rounded-xl"
                    iconClassName="size-5"
                  />

                  {/* Title & Category Column */}
                  <div className="min-w-0 flex-1 sm:w-44 sm:flex-none xl:w-52">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {cred.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {getCategoryLabel(cred.category)}
                    </p>
                  </div>

                  {/* Identifier & URL/Host Column */}
                  <div className="hidden min-w-0 flex-1 sm:block">
                    <p
                      className={cn(
                        'truncate text-sm text-foreground/90',
                        cred.category === 'api_key' &&
                          !cred.username &&
                          'font-mono text-xs tracking-wider',
                      )}
                    >
                      {cols.primary}
                    </p>
                    {cols.secondary && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {cols.secondary}
                      </p>
                    )}
                  </div>

                  {/* Relative Modification Date */}
                  <div className="hidden shrink-0 text-right text-xs text-muted-foreground md:block">
                    {formatModifiedRelative(cred.updated_at)}
                  </div>

                  {/* Favorite Star & More Menu */}
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="size-7"
                      disabled={!canWrite}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (canWrite) onToggleFavorite(cred)
                      }}
                      title={
                        cred.favorite
                          ? 'Rimuovi dai preferiti'
                          : 'Aggiungi ai preferiti'
                      }
                    >
                      <Star
                        className={cn(
                          'size-4 transition-colors',
                          cred.favorite
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-muted-foreground/70 hover:text-amber-400',
                        )}
                      />
                    </Button>
                    {renderRowMenu(cred)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}
