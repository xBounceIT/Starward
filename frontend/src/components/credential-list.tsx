import { useRef, useEffect } from 'react'
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
import { CategoryIcon, VaultIcon } from '@/components/vault-icon'
import type { Credential, Vault } from '@/lib/api'
import {
  cn,
  CREDENTIAL_CATEGORIES,
  getInitials,
  getVaultColor,
} from '@/lib/utils'

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
      toast.success(`${label} copiata negli appunti`)
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
      <div className="border-b px-4 py-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
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
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant={activeVault.is_shared ? 'secondary' : 'outline'}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => onShareVault(activeVault)}
              >
                {activeVault.is_shared ? (
                  <Users className="size-3.5 text-primary" />
                ) : (
                  <Share2 className="size-3.5" />
                )}
                {activeVault.role === 'owner'
                  ? 'Condividi'
                  : `Membri (${activeVault.member_count})`}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="size-8">
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
          <button
            type="button"
            onClick={() => onShareVault(activeVault)}
            className="flex w-full items-center justify-between rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs hover:bg-muted/70 transition-colors cursor-pointer"
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
                Cartella condivisa con{' '}
                <strong className="text-foreground">
                  {activeVault.member_count} persone
                </strong>
              </span>
            </div>
            <span className="text-primary font-medium">Gestisci</span>
          </button>
        )}

        {/* Search input */}
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            ref={searchInputRef}
            placeholder="Cerca titolo, username, URL... (Ctrl+K)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 pr-8 h-9 text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Category pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          <button
            type="button"
            onClick={() => onCategoryFilterChange('')}
            className={cn(
              'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer',
              categoryFilter === ''
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            Tutte
          </button>
          {CREDENTIAL_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() =>
                onCategoryFilterChange(
                  categoryFilter === cat.value ? '' : cat.value,
                )
              }
              className={cn(
                'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer',
                categoryFilter === cat.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {cat.label}
            </button>
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
                className="h-16 animate-pulse rounded-xl bg-muted/60"
              />
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
            <p className="mt-1 text-xs text-muted-foreground max-w-60">
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
                    'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all cursor-pointer border',
                    isSelected
                      ? 'bg-accent/70 border-primary/30 shadow-xs'
                      : 'border-transparent hover:bg-muted/60',
                  )}
                >
                  <div
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg',
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
                      {cred.username || cred.url || 'Nessun username'}
                    </p>
                    {selection.type !== 'vault' && (
                      <div className="mt-1 flex items-center gap-1">
                        <span
                          className={cn('size-1.5 rounded-full', vaultPalette.dot)}
                        />
                        <span className="truncate text-[10px] text-muted-foreground">
                          {cred.vault_name}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Hover quick-copy buttons */}
                  <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                    {cred.username && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-7"
                        title="Copia username"
                        onClick={(e) =>
                          copyQuick(e, cred.username, 'Username')
                        }
                      >
                        <User className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-7"
                      title="Copia password"
                      onClick={(e) => copyQuick(e, cred.password, 'Password')}
                    >
                      <Copy className="size-3.5" />
                    </Button>
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
