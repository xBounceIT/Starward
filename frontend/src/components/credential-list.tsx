import { useEffect, useRef } from 'react'
import {
  Copy,
  History,
  KeyRound,
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
import { CategoryIcon, VaultIcon } from '@/components/vault-icon'
import type { Credential, Vault } from '@/lib/api'
import {
  CREDENTIAL_CATEGORIES,
  getCredentialQuickCopy,
  getCredentialSubtitle,
} from '@/lib/credential-types'
import { cn } from '@/lib/utils'
import { getInitials, getVaultColor } from '@/lib/vault-utils'

interface CredentialListProps {
  selection: VaultSelection
  activeVault: Vault | null
  credentials: Credential[]
  selectedCredentialId: string | null
  searchQuery: string
  categoryFilter: string
  loading: boolean
  onSearchChange: (q: string) => void
  onCategoryFilterChange: (cat: string) => void
  onSelectCredential: (cred: Credential) => void
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
  selectedCredentialId,
  searchQuery,
  categoryFilter,
  loading,
  onSearchChange,
  onCategoryFilterChange,
  onSelectCredential,
  onNewCredential,
  onShareVault,
  onEditVault,
  onDeleteVault,
  onOpenAudit,
}: CredentialListProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)

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
      ? 'Tutte le tue cartelle personali e condivise'
      : selection.type === 'favorites'
        ? 'Accesso rapido alle credenziali principali'
        : activeVault?.description ||
          (activeVault?.is_shared_with_me
            ? `Cartella condivisa da ${activeVault.owner_name}`
            : 'Cartella del vault centralizzato')

  const canCreateInCurrent =
    !activeVault ||
    activeVault.role === 'owner' ||
    activeVault.role === 'editor'

  return (
    <section className="flex h-full w-full flex-col border-r bg-background lg:w-96 lg:shrink-0">
      {/* Header */}
      <div className="space-y-3 border-b px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1 hidden shrink-0 md:inline-flex" />
              {activeVault && (
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-md',
                    getVaultColor(activeVault.color).bg,
                    getVaultColor(activeVault.color).text,
                  )}
                >
                  <VaultIcon icon={activeVault.icon} className="size-3.5" />
                </span>
              )}
              <h2 className="truncate text-base font-semibold tracking-tight">
                {headerTitle}
              </h2>
              {activeVault?.is_shared_with_me && (
                <Badge variant="secondary" className="text-[10px]">
                  {activeVault.role === 'editor' ? 'Editor' : 'Sola lettura'}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {headerSubtitle}
            </p>
          </div>

          {activeVault && (
            <div className="flex shrink-0 items-center gap-1">
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
                  <Button variant="ghost" size="icon-sm">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onOpenAudit(activeVault)}>
                    <History className="size-4" />
                    Registro attività
                  </DropdownMenuItem>
                  {activeVault.role === 'owner' && (
                    <>
                      <DropdownMenuItem
                        onClick={() => onEditVault(activeVault)}
                      >
                        <Pencil className="size-4" />
                        Modifica cartella
                      </DropdownMenuItem>
                      {!activeVault.is_personal && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => onDeleteVault(activeVault)}
                          >
                            <Trash2 className="size-4" />
                            Elimina cartella
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Shared folder members preview bar */}
        {activeVault && activeVault.is_shared && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onShareVault(activeVault)}
            className="h-auto w-full justify-between px-2.5 py-1.5 text-xs font-normal"
          >
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1.5">
                {activeVault.members.slice(0, 4).map((m) => (
                  <Avatar
                    key={m.id}
                    className="size-5 ring-2 ring-background"
                  >
                    <AvatarFallback className="text-[9px]">
                      {getInitials(m.name || m.email)}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <span className="text-muted-foreground">
                Condivisa con{' '}
                <strong className="text-foreground">
                  {activeVault.member_count} persone
                </strong>
              </span>
            </div>
            <span className="font-medium text-foreground">Gestisci</span>
          </Button>
        )}

        {/* Search input */}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Cerca titolo, username, URL... (Ctrl+K)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 pr-8 pl-8 text-sm"
          />
          {searchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => onSearchChange('')}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
              aria-label="Cancella ricerca"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>

        {/* Category filter buttons */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <Button
            type="button"
            size="xs"
            variant={categoryFilter === '' ? 'default' : 'secondary'}
            className="shrink-0 rounded-full"
            onClick={() => onCategoryFilterChange('')}
          >
            Tutte
          </Button>
          {CREDENTIAL_CATEGORIES.map((cat) => (
            <Button
              key={cat.value}
              type="button"
              size="xs"
              variant={categoryFilter === cat.value ? 'default' : 'secondary'}
              className="shrink-0 rounded-full"
              onClick={() =>
                onCategoryFilterChange(
                  categoryFilter === cat.value ? '' : cat.value,
                )
              }
            >
              {cat.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Credential items */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="space-y-2 p-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <Skeleton className="size-9 shrink-0 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <KeyRound className="size-6" />
            </div>
            <p className="mt-3 text-sm font-medium">
              Nessuna credenziale trovata
            </p>
            <p className="mt-1 max-w-60 text-xs text-muted-foreground">
              {searchQuery || categoryFilter
                ? 'Prova a modificare i filtri di ricerca.'
                : 'Aggiungi la prima credenziale in questa cartella per iniziare.'}
            </p>
            {canCreateInCurrent && !searchQuery && !categoryFilter && (
              <Button size="sm" className="mt-4" onClick={onNewCredential}>
                <Plus className="size-4" />
                Aggiungi credenziale
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {credentials.map((cred) => {
              const isSelected = cred.id === selectedCredentialId
              const vaultPalette = getVaultColor(cred.vault_color)
              const subtitle = getCredentialSubtitle(cred)
              const quickCopy = getCredentialQuickCopy(cred)

              return (
                <div
                  key={cred.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectCredential(cred)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectCredential(cred)
                    }
                  }}
                  className={cn(
                    'group relative flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    isSelected
                      ? 'border-border bg-accent text-accent-foreground'
                      : 'border-transparent hover:bg-muted/60',
                  )}
                >
                  <div
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-md',
                      vaultPalette.bg,
                      vaultPalette.text,
                    )}
                  >
                    <CategoryIcon category={cred.category} className="size-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {cred.title}
                      </span>
                      {cred.favorite && (
                        <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {subtitle}
                    </p>
                    {selection.type !== 'vault' && (
                      <div className="mt-1 flex items-center gap-1">
                        <span
                          className={cn(
                            'size-1.5 rounded-full',
                            vaultPalette.dot,
                          )}
                        />
                        <span className="truncate text-[10px] text-muted-foreground">
                          {cred.vault_name}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Hover quick-copy buttons */}
                  {(quickCopy.primary || quickCopy.secondary) && (
                    <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      {quickCopy.primary && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title={`Copia ${quickCopy.primary.label}`}
                          onClick={(e) =>
                            copyQuick(
                              e,
                              quickCopy.primary!.value,
                              quickCopy.primary!.label,
                            )
                          }
                        >
                          <User className="size-3.5" />
                        </Button>
                      )}
                      {quickCopy.secondary && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title={`Copia ${quickCopy.secondary.label}`}
                          onClick={(e) =>
                            copyQuick(
                              e,
                              quickCopy.secondary!.value,
                              quickCopy.secondary!.label,
                            )
                          }
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}
