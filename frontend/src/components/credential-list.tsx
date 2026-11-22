import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect
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
  ShieldCheck,
  Star,
  Trash2,
  Upload,
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
  getVaultDisplayIcon,
  VaultIcon,
} from '@/components/vault-icon'
import type { Credential, Vault } from '@/lib/api'
import {
  CREDENTIAL_CATEGORIES,
  getCategoryLabel,
  getCredentialListColumns,
  getCredentialQuickCopy,
  hasCredentialTotp,
} from '@/lib/credential-types'
import { generateTotpFromRaw } from '@/lib/otp'
import { cn, copyToClipboard } from '@/lib/utils'
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

const LIST_ROW_HEIGHT = 68
const LIST_ROW_GAP = 8
const LIST_STRIDE = LIST_ROW_HEIGHT + LIST_ROW_GAP
const GRID_CARD_HEIGHT = 148
const GRID_ROW_GAP = 12
const GRID_STRIDE = GRID_CARD_HEIGHT + GRID_ROW_GAP
const VIRTUAL_OVERSCAN_ROWS = 4
const GRID_2COL_MIN_WIDTH = 560
const GRID_3COL_MIN_WIDTH = 920

function computeGridCols(width: number): 1 | 2 | 3 {
  if (width >= GRID_3COL_MIN_WIDTH) return 3
  if (width >= GRID_2COL_MIN_WIDTH) return 2
  return 1
}

interface CredentialRowMenuButtonProps {
  cred: Credential
  isOpen: boolean
  onOpenChange: (credId: string | null) => void
  onCopyQuick: (e: React.MouseEvent, text: string, label: string) => void
  onEditCredential: (cred: Credential) => void
  onDeleteCredential: (cred: Credential) => void
}

const CredentialRowMenuButton = memo(function CredentialRowMenuButton({
  cred,
  isOpen,
  onOpenChange,
  onCopyQuick,
  onEditCredential,
  onDeleteCredential,
}: CredentialRowMenuButtonProps) {
  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-7 text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation()
          onOpenChange(cred.id)
        }}
        aria-label="Azioni credenziale"
        aria-haspopup="menu"
        aria-expanded={false}
      >
        <MoreHorizontal className="size-4" />
      </Button>
    )
  }

  const quickCopy = getCredentialQuickCopy(cred)
  const canWrite = cred.vault_role === 'owner' || cred.vault_role === 'editor'
  const normalizedUrl = cred.url
    ? /^https?:\/\//i.test(cred.url)
      ? cred.url
      : `https://${cred.url}`
    : ''

  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onOpenChange(null)
      }}
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
              onCopyQuick(
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
              onCopyQuick(
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
        {hasCredentialTotp(cred) && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              const otp = generateTotpFromRaw(cred.fields.totp)
              if (!otp) {
                toast.error('Configurazione OTP non valida')
                return
              }
              onCopyQuick(e, otp.code, 'Codice OTP')
            }}
          >
            <ShieldCheck className="size-4" />
            Copia codice OTP
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
            {(quickCopy.primary ||
              quickCopy.secondary ||
              normalizedUrl ||
              hasCredentialTotp(cred)) && <DropdownMenuSeparator />}
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
})

interface CredentialItemCardProps {
  cred: Credential
  isSelected: boolean
  isMenuOpen: boolean
  onSelect: (cred: Credential) => void
  onContextMenuOpen: (credId: string) => void
  onToggleFavorite: (cred: Credential) => void
  onMenuOpenChange: (credId: string | null) => void
  onCopyQuick: (e: React.MouseEvent, text: string, label: string) => void
  onEditCredential: (cred: Credential) => void
  onDeleteCredential: (cred: Credential) => void
}

const CredentialGridCard = memo(function CredentialGridCard({
  cred,
  isSelected,
  isMenuOpen,
  onSelect,
  onContextMenuOpen,
  onToggleFavorite,
  onMenuOpenChange,
  onCopyQuick,
  onEditCredential,
  onDeleteCredential,
}: CredentialItemCardProps) {
  const cols = getCredentialListColumns(cred)
  const canWrite = cred.vault_role === 'owner' || cred.vault_role === 'editor'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(cred)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenuOpen(cred.id)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(cred)
        }
      }}
      className={cn(
        'group relative flex h-[148px] min-w-0 cursor-pointer flex-col justify-between gap-2.5 overflow-hidden border p-4 text-left transition-colors rounded-lg',
        isSelected
          ? 'border-primary/60 bg-accent/70 ring-ring/30 sync-security:border-[#ff9c00] sync-security:bg-[#132442] ring-0 shadow-none'
          : 'border-border/70 bg-card/45 hover:border-border hover:bg-card/80 sync-security:border-white/12 sync-security:bg-[#0e1b33] sync-security:hover:border-[#ff9c00]/60 sync-security:hover:bg-[#132442]',
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <CredentialBrandIcon
            credential={cred}
            className="size-10 rounded-lg"
            iconClassName="size-5"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground transition-colors sync-security:group-hover:text-[#ff9c00]">
              {cred.title}
            </p>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <p className="truncate text-xs text-muted-foreground">
                {getCategoryLabel(cred.category)}
              </p>
              {hasCredentialTotp(cred) && (
                <Badge
                  variant="secondary"
                  className="h-4 shrink-0 gap-0.5 px-1.5 py-0 font-mono text-[9px] font-semibold tracking-wider uppercase sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]"
                >
                  <ShieldCheck className="size-2.5" />
                  OTP
                </Badge>
              )}
            </div>
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
              cred.favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'
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
          <CredentialRowMenuButton
            cred={cred}
            isOpen={isMenuOpen}
            onOpenChange={onMenuOpenChange}
            onCopyQuick={onCopyQuick}
            onEditCredential={onEditCredential}
            onDeleteCredential={onDeleteCredential}
          />
        </div>
      </div>

      <div className="min-h-[34px] min-w-0 space-y-0.5 border-t border-border/50 pt-2">
        <p className="truncate text-xs font-medium text-foreground/90">
          {cols.primary}
        </p>
        {cols.secondary && (
          <p className="truncate text-[11px] text-muted-foreground">
            {cols.secondary}
          </p>
        )}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">{cred.vault_name}</span>
        <span className="shrink-0">
          {formatModifiedRelative(cred.updated_at)}
        </span>
      </div>
    </div>
  )
})

const CredentialListRow = memo(function CredentialListRow({
  cred,
  isSelected,
  isMenuOpen,
  onSelect,
  onContextMenuOpen,
  onToggleFavorite,
  onMenuOpenChange,
  onCopyQuick,
  onEditCredential,
  onDeleteCredential,
}: CredentialItemCardProps) {
  const cols = getCredentialListColumns(cred)
  const canWrite = cred.vault_role === 'owner' || cred.vault_role === 'editor'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(cred)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenuOpen(cred.id)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(cred)
        }
      }}
      className={cn(
        'group relative flex h-[68px] min-w-0 cursor-pointer items-center gap-4 overflow-hidden border px-4 py-3 text-left transition-colors rounded-lg',
        isSelected
          ? 'border-primary/60 bg-accent/70 ring-ring/30 sync-security:border-[#ff9c00] sync-security:bg-[#132442] ring-0 shadow-none'
          : 'border-border/70 bg-card/45 hover:border-border hover:bg-card/80 sync-security:border-white/12 sync-security:bg-[#0e1b33] sync-security:hover:border-[#ff9c00]/60 sync-security:hover:bg-[#132442]',
      )}
    >
      <CredentialBrandIcon
        credential={cred}
        className="size-10 rounded-lg"
        iconClassName="size-5"
      />

      {/* Title & Category Column */}
      <div className="min-w-0 flex-1 @[520px]:w-44 @[520px]:flex-none @[760px]:w-52">
        <p className="truncate text-sm font-semibold text-foreground transition-colors sync-security:group-hover:text-[#ff9c00]">
          {cred.title}
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <p className="truncate text-xs text-muted-foreground">
            {getCategoryLabel(cred.category)}
          </p>
          {hasCredentialTotp(cred) && (
            <Badge
              variant="secondary"
              className="h-4 shrink-0 gap-0.5 px-1.5 py-0 font-mono text-[9px] font-semibold tracking-wider uppercase sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]"
            >
              <ShieldCheck className="size-2.5" />
              OTP
            </Badge>
          )}
        </div>
      </div>

      {/* Identifier & URL/Host Column */}
      <div className="hidden min-w-0 flex-1 @[520px]:block">
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
      <div className="hidden shrink-0 text-right text-xs text-muted-foreground @[680px]:block">
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
            cred.favorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'
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
        <CredentialRowMenuButton
          cred={cred}
          isOpen={isMenuOpen}
          onOpenChange={onMenuOpenChange}
          onCopyQuick={onCopyQuick}
          onEditCredential={onEditCredential}
          onDeleteCredential={onDeleteCredential}
        />
      </div>
    </div>
  )
})

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
  hasWritableVault: boolean
  onNewCredential: () => void
  onImportVault: (vault: Vault | null) => void
  onShareVault: (vault: Vault) => void
  onEditVault: (vault: Vault) => void
  onDeleteVault: (vault: Vault) => void
  onOpenAudit: (vault: Vault) => void
}

export const CredentialList = memo(function CredentialList({
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
  hasWritableVault,
  onNewCredential,
  onImportVault,
  onShareVault,
  onEditVault,
  onDeleteVault,
  onOpenAudit,
}: CredentialListProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const categoryScrollRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)
  const rowStrideRef = useRef(LIST_STRIDE)
  const pendingScrollTopRef = useRef<number | null>(null)

  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [openMenuCredId, setOpenMenuCredId] = useState<string | null>(null)
  const [categoryEdges, setCategoryEdges] = useState({ left: false, right: false })
  const [viewportMetrics, setViewportMetrics] = useState<{
    gridCols: 1 | 2 | 3
    height: number
  }>({ gridCols: 2, height: 800 })
  const [visibleStartRow, setVisibleStartRow] = useState(0)

  const activeCols = viewMode === 'grid' ? viewportMetrics.gridCols : 1
  const rowStride = viewMode === 'grid' ? GRID_STRIDE : LIST_STRIDE
  const rowGap = viewMode === 'grid' ? GRID_ROW_GAP : LIST_ROW_GAP
  rowStrideRef.current = rowStride

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
    const updateEdges = () => {
      const maxScroll = el.scrollWidth - el.clientWidth
      setCategoryEdges((prev) => {
        const left = el.scrollLeft > 1
        const right = el.scrollLeft < maxScroll - 1
        return prev.left === left && prev.right === right
          ? prev
          : { left, right }
      })
    }
    updateEdges()
    const edgeObserver = new ResizeObserver(updateEdges)
    edgeObserver.observe(el)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('scroll', updateEdges, { passive: true })
    return () => {
      edgeObserver.disconnect()
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('scroll', updateEdges)
    }
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const updateMetrics = () => {
      if (viewport.clientWidth === 0 || viewport.clientHeight === 0) return
      const nextCols = computeGridCols(viewport.clientWidth)
      const nextHeight = viewport.clientHeight
      setViewportMetrics((prev) =>
        prev.gridCols === nextCols && prev.height === nextHeight
          ? prev
          : { gridCols: nextCols, height: nextHeight },
      )
    }

    const handleScroll = () => {
      const top = viewport.scrollTop
      scrollTopRef.current = top
      const nextStart = Math.max(
        0,
        Math.floor(top / rowStrideRef.current) - VIRTUAL_OVERSCAN_ROWS,
      )
      setVisibleStartRow((prev) => (prev === nextStart ? prev : nextStart))
    }

    updateMetrics()
    handleScroll()

    const observer = new ResizeObserver(updateMetrics)
    observer.observe(viewport)
    viewport.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      observer.disconnect()
      viewport.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const selectionKey =
    selection.type === 'vault' ? `vault:${selection.vaultId}` : selection.type

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport) {
      viewport.scrollTop = 0
    }
    scrollTopRef.current = 0
    setVisibleStartRow(0)
  }, [selectionKey, searchQuery, categoryFilter, sortBy])

  const totalRows = Math.ceil(credentials.length / activeCols)
  const totalHeight = totalRows > 0 ? totalRows * rowStride - rowGap + 8 : 0

  useIsomorphicLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || viewport.clientHeight === 0) return
    const maxScroll = Math.max(0, totalHeight - viewport.clientHeight)
    if (pendingScrollTopRef.current !== null) {
      const target = Math.min(pendingScrollTopRef.current, maxScroll)
      pendingScrollTopRef.current = null
      viewport.scrollTop = target
      scrollTopRef.current = target
      const nextStart = Math.max(
        0,
        Math.floor(target / rowStride) - VIRTUAL_OVERSCAN_ROWS,
      )
      setVisibleStartRow((prev) => (prev === nextStart ? prev : nextStart))
      return
    }
    if (viewport.scrollTop > maxScroll) {
      viewport.scrollTop = maxScroll
      scrollTopRef.current = maxScroll
      const nextStart = Math.max(
        0,
        Math.floor(maxScroll / rowStride) - VIRTUAL_OVERSCAN_ROWS,
      )
      setVisibleStartRow(nextStart)
    }
  }, [totalHeight, rowStride])

  const visibleRowCount =
    Math.ceil(Math.max(viewportMetrics.height, 400) / rowStride) +
    VIRTUAL_OVERSCAN_ROWS * 2 +
    1
  const startRow = Math.min(visibleStartRow, Math.max(0, totalRows - 1))
  const endRow = Math.min(totalRows - 1, startRow + visibleRowCount)

  const visibleCredentials = useMemo(
    () =>
      totalRows === 0
        ? []
        : credentials.slice(startRow * activeCols, (endRow + 1) * activeCols),
    [credentials, totalRows, startRow, endRow, activeCols],
  )
  const offsetY = startRow * rowStride

  const handleViewModeChange = useCallback(
    (nextMode: 'list' | 'grid') => {
      if (nextMode === viewMode) return
      const currentCols = viewMode === 'grid' ? viewportMetrics.gridCols : 1
      const currentStride = viewMode === 'grid' ? GRID_STRIDE : LIST_STRIDE
      const nextCols = nextMode === 'grid' ? viewportMetrics.gridCols : 1
      const nextStride = nextMode === 'grid' ? GRID_STRIDE : LIST_STRIDE
      const nextGap = nextMode === 'grid' ? GRID_ROW_GAP : LIST_ROW_GAP

      const currentTopRow = Math.floor(scrollTopRef.current / currentStride)
      const firstVisibleIndex = currentTopRow * currentCols
      const nextRow = Math.floor(firstVisibleIndex / nextCols)

      const nextTotalRows = Math.ceil(credentials.length / nextCols)
      const nextTotalHeight =
        nextTotalRows > 0 ? nextTotalRows * nextStride - nextGap + 8 : 0
      const maxScrollTop = Math.max(0, nextTotalHeight - viewportMetrics.height)
      const targetScrollTop = Math.min(nextRow * nextStride, maxScrollTop)

      const nextStart = Math.max(
        0,
        Math.floor(targetScrollTop / nextStride) - VIRTUAL_OVERSCAN_ROWS,
      )

      setOpenMenuCredId(null)
      pendingScrollTopRef.current = targetScrollTop
      scrollTopRef.current = targetScrollTop
      rowStrideRef.current = nextStride
      setVisibleStartRow(nextStart)
      setViewMode(nextMode)
    },
    [viewMode, viewportMetrics.gridCols, viewportMetrics.height, credentials.length],
  )

  const copyQuick = useCallback(
    async (e: React.MouseEvent, text: string, label: string) => {
      e.stopPropagation()
      if (await copyToClipboard(text)) {
        toast.success(`${label} copiato negli appunti`)
      } else {
        toast.error('Impossibile copiare negli appunti')
      }
    },
    [],
  )

  const handleContextMenuOpen = useCallback((credId: string) => {
    setOpenMenuCredId(credId)
  }, [])

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
          (activeVault?.owner_group_name
            ? `Cartella del gruppo ${activeVault.owner_group_name} · condivisa automaticamente con tutti i membri.`
            : activeVault?.is_shared_with_me
              ? `Cartella condivisa da ${activeVault.owner_name}`
              : 'Tutte le tue credenziali archiviate in questa cartella.')

  const canCreateInCurrent =
    !activeVault ||
    activeVault.role === 'owner' ||
    activeVault.role === 'editor'

  const canImport = activeVault ? canCreateInCurrent : hasWritableVault

  const currentSortLabel =
    SORT_OPTIONS.find((s) => s.value === sortBy)?.label ?? 'Ultima modifica'

  return (
    <section className="@container flex h-full min-w-0 flex-1 flex-col bg-background">
      {/* Top Workspace Header & Controls */}
      <div className="space-y-4 px-5 pt-5 pb-3 sm:px-6">
        {/* Title & Vault Actions */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[200px] flex-1">
            <div className="flex items-center gap-2.5">
              <SidebarTrigger className="-ml-1 hidden shrink-0 md:inline-flex lg:hidden" />
              {selection.type === 'all' ? (
                <Layers className="size-5 shrink-0 text-muted-foreground sync-security:text-[#ff9c00]" />
              ) : selection.type === 'favorites' ? (
                <Star className="size-5 shrink-0 fill-amber-400 text-amber-400 sync-security:fill-[#ff9c00] sync-security:text-[#ff9c00]" />
              ) : activeVault ? (
                <VaultIcon
                  icon={getVaultDisplayIcon(activeVault)}
                  className={cn(
                    'size-5 shrink-0',
                    getVaultColor(activeVault.color).text,
                  )}
                />
              ) : null}
              <h2 className="truncate font-bold text-lg tracking-normal">
                {headerTitle}
              </h2>
              {activeVault?.owner_group_name && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'gap-1 text-[10px]',
                    getVaultColor(activeVault.owner_group_color ?? 'indigo').bg,
                    getVaultColor(activeVault.owner_group_color ?? 'indigo')
                      .text,
                  )}
                >
                  <Users className="size-3" />
                  {activeVault.owner_group_name}
                </Badge>
              )}
              {(activeVault?.is_shared_with_me ||
                (activeVault?.owner_group_id &&
                  activeVault.role !== 'owner')) && (
                <Badge variant="secondary" className="text-[10px]">
                  {activeVault.role === 'editor' ? 'Editor' : 'Sola lettura'}
                </Badge>
              )}
            </div>
            <p className="mt-1 truncate pl-7 text-xs text-muted-foreground">
              {headerSubtitle}
            </p>
          </div>

          {(activeVault || canImport) && (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {activeVault?.is_shared && (
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
              {canImport && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => onImportVault(activeVault)}
                >
                  <Upload className="size-3.5" />
                  Importa da altri password manager
                </Button>
              )}

              {activeVault && (
                <>
                  <Button
                    variant={activeVault.is_shared ? 'secondary' : 'outline'}
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
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
                      <Button variant="ghost" size="icon-sm" className="">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {canCreateInCurrent && (
                        <>
                          <DropdownMenuItem onClick={onNewCredential}>
                            <Plus className="size-4" />
                            Nuova credenziale
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onImportVault(activeVault)}
                          >
                            <Upload className="size-4" />
                            Importa credenziali
                          </DropdownMenuItem>
                        </>
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
                </>
              )}
            </div>
          )}
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="grid grid-cols-2 gap-3 @[760px]:grid-cols-4">
          <div className="flex items-center gap-3.5 border border-border/70 bg-card/50 px-4 py-3 rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
            <div className="flex size-10 shrink-0 items-center justify-center bg-muted text-foreground rounded-full sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b]">
              <KeyRound className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight sync-security:text-[#ff9c00]">
                {stats.total}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Credenziali totali
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 border border-border/70 bg-card/50 px-4 py-3 rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
            <div className="flex size-10 shrink-0 items-center justify-center bg-amber-500/15 text-amber-400 rounded-full sync-security:bg-[#ff9c00]/20 sync-security:text-[#ff9c00]">
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

          <div className="flex items-center gap-3.5 border border-border/70 bg-card/50 px-4 py-3 rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
            <div className="flex size-10 shrink-0 items-center justify-center bg-sky-500/15 text-sky-400 rounded-full">
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

          <div className="flex items-center gap-3.5 border border-border/70 bg-card/50 px-4 py-3 rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
            <div className="flex size-10 shrink-0 items-center justify-center bg-emerald-500/15 text-emerald-400 rounded-full">
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
              className="h-10 border-border/70 bg-card/50 pr-24 pl-10 text-sm rounded-lg sync-security:border-white/20 sync-security:bg-[#0e1b33]"
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
              <kbd className="pointer-events-none hidden rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 font-sans text-[11px] font-medium text-muted-foreground sync-security:border-[#ff9c00]/35 sync-security:bg-[#1a2c4b] sync-security:text-[#ff9c00] @[520px]:inline-block">
                Ctrl + K
              </kbd>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 border-border/70 bg-card/50 px-3.5 text-xs font-medium hover:bg-card"
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

          <div className="flex h-10 items-center gap-0.5 border border-border/70 bg-card/50 p-1 rounded-lg sync-security:border-white/20 sync-security:bg-[#0e1b33]">
            <button
              type="button"
              onClick={() => handleViewModeChange('list')}
              title="Vista lista"
              aria-label="Vista lista"
              className={cn(
                'flex size-8 items-center justify-center transition-colors rounded-md',
                viewMode === 'list'
                  ? 'bg-accent text-accent-foreground shadow-xs ring-border sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b] ring-0'
                  : 'text-muted-foreground hover:text-foreground sync-security:hover:text-[#ff9c00]',
              )}
            >
              <List className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('grid')}
              title="Vista griglia"
              aria-label="Vista griglia"
              className={cn(
                'flex size-8 items-center justify-center transition-colors rounded-md',
                viewMode === 'grid'
                  ? 'bg-accent text-accent-foreground shadow-xs ring-border sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b] ring-0'
                  : 'text-muted-foreground hover:text-foreground sync-security:hover:text-[#ff9c00]',
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
        </div>

        {/* Category Filter Pills & Total Count */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative min-w-0 flex-1">
            <div
              ref={categoryScrollRef}
              className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
            >
              <button
                type="button"
                onClick={() => onCategoryFilterChange('')}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 px-3.5 text-xs transition-colors rounded-md',
                  categoryFilter === ''
                    ? 'bg-foreground text-background shadow-xs border sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00] font-bold sync-security:text-[#1a2c4b]'
                    : 'border border-border/70 bg-card/40 font-medium text-muted-foreground hover:bg-card hover:text-foreground sync-security:border-white/20 sync-security:bg-[#0e1b33] sync-security:text-white/80 sync-security:hover:border-[#ff9c00] sync-security:hover:text-[#ff9c00]',
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
                      'inline-flex h-8 shrink-0 items-center gap-1.5 px-3.5 text-xs transition-colors rounded-md',
                      active
                        ? 'bg-foreground text-background shadow-xs border sync-security:border-[#ff9c00] sync-security:bg-[#ff9c00] font-bold sync-security:text-[#1a2c4b]'
                        : 'border border-border/70 bg-card/40 font-medium text-muted-foreground hover:bg-card hover:text-foreground sync-security:border-white/20 sync-security:bg-[#0e1b33] sync-security:text-white/80 sync-security:hover:border-[#ff9c00] sync-security:hover:text-[#ff9c00]',
                    )}
                  >
                    <CategoryIcon category={cat.value} className="size-3.5" />
                    <span>{cat.label}</span>
                  </button>
                )
              })}
            </div>
            {categoryEdges.left && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-10 backdrop-blur-[3px] [mask-image:linear-gradient(to_right,black,transparent)] [-webkit-mask-image:linear-gradient(to_right,black,transparent)]"
              />
            )}
            {categoryEdges.right && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-10 backdrop-blur-[3px] [mask-image:linear-gradient(to_left,black,transparent)] [-webkit-mask-image:linear-gradient(to_left,black,transparent)]"
              />
            )}
          </div>

          <span className="shrink-0 text-xs text-muted-foreground">
            {credentials.length}{' '}
            {credentials.length === 1 ? 'credenziale' : 'credenziali'}
          </span>
        </div>
      </div>

      {/* Credential Items */}
      <ScrollArea
        viewportRef={viewportRef}
        className="min-h-0 flex-1 px-5 pb-5 sm:px-6"
      >
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
          <div className="flex flex-col items-center justify-center border border-dashed border-border/70 bg-card/20 px-6 py-16 text-center rounded-lg sync-security:border-white/20 sync-security:bg-[#0e1b33]">
            <div className="flex size-12 items-center justify-center bg-muted text-foreground rounded-full sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b]">
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
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" onClick={onNewCredential}>
                  <Plus className="size-4" />
                  Aggiungi credenziale
                </Button>
                {canImport && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onImportVault(activeVault)}
                  >
                    <Upload className="size-4" />
                    Importa da altri password manager
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div
              style={
                viewMode === 'grid'
                  ? {
                      transform: `translate3d(0, ${offsetY}px, 0)`,
                      gridTemplateColumns: `repeat(${activeCols}, minmax(0, 1fr))`,
                    }
                  : { transform: `translate3d(0, ${offsetY}px, 0)` }
              }
              className={
                viewMode === 'grid' ? 'grid gap-3' : 'flex flex-col gap-2'
              }
            >
              {viewMode === 'grid'
                ? visibleCredentials.map((cred) => (
                    <CredentialGridCard
                      key={cred.id}
                      cred={cred}
                      isSelected={cred.id === selectedCredentialId}
                      isMenuOpen={openMenuCredId === cred.id}
                      onSelect={onSelectCredential}
                      onContextMenuOpen={handleContextMenuOpen}
                      onToggleFavorite={onToggleFavorite}
                      onMenuOpenChange={setOpenMenuCredId}
                      onCopyQuick={copyQuick}
                      onEditCredential={onEditCredential}
                      onDeleteCredential={onDeleteCredential}
                    />
                  ))
                : visibleCredentials.map((cred) => (
                    <CredentialListRow
                      key={cred.id}
                      cred={cred}
                      isSelected={cred.id === selectedCredentialId}
                      isMenuOpen={openMenuCredId === cred.id}
                      onSelect={onSelectCredential}
                      onContextMenuOpen={handleContextMenuOpen}
                      onToggleFavorite={onToggleFavorite}
                      onMenuOpenChange={setOpenMenuCredId}
                      onCopyQuick={copyQuick}
                      onEditCredential={onEditCredential}
                      onDeleteCredential={onDeleteCredential}
                    />
                  ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </section>
  )
})
