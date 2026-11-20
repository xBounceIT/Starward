import {
  FolderPlus,
  Layers,
  LogOut,
  Moon,
  Plus,
  ShieldCheck,
  Star,
  Sun,
  Users,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { VaultIcon } from '@/components/vault-icon'
import type { Vault } from '@/lib/api'
import { cn, getInitials, getVaultColor } from '@/lib/utils'

export type VaultSelection =
  | { type: 'all' }
  | { type: 'favorites' }
  | { type: 'vault'; vaultId: string }

interface AppSidebarProps {
  user: { id: string; name: string; email: string }
  vaults: Vault[]
  totalCredentialsCount: number
  favoritesCount: number
  selection: VaultSelection
  onSelect: (selection: VaultSelection) => void
  onNewCredential: () => void
  onNewVault: () => void
  onSignOut: () => void
  darkMode: boolean
  onToggleDarkMode: () => void
}

export function AppSidebar({
  user,
  vaults,
  totalCredentialsCount,
  favoritesCount,
  selection,
  onSelect,
  onNewCredential,
  onNewVault,
  onSignOut,
  darkMode,
  onToggleDarkMode,
}: AppSidebarProps) {
  const myVaults = vaults.filter((v) => !v.is_shared_with_me)
  const sharedWithMe = vaults.filter((v) => v.is_shared_with_me)

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-card/60">
      {/* Brand header */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <ShieldCheck className="size-4.5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight leading-none">
              Starward
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Password Vault
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleDarkMode}
          title={darkMode ? 'Tema chiaro' : 'Tema scuro'}
        >
          {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>

      {/* Primary action */}
      <div className="px-3 pb-3">
        <Button className="w-full justify-start gap-2" onClick={onNewCredential}>
          <Plus className="size-4" />
          Nuova credenziale
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2.5">
        {/* Quick views */}
        <div className="space-y-0.5 pb-3">
          <button
            type="button"
            onClick={() => onSelect({ type: 'all' })}
            className={cn(
              'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors cursor-pointer',
              selection.type === 'all'
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-foreground/80 hover:bg-muted',
            )}
          >
            <span className="flex items-center gap-2.5">
              <Layers className="size-4 text-primary" />
              Tutte le credenziali
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {totalCredentialsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelect({ type: 'favorites' })}
            className={cn(
              'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors cursor-pointer',
              selection.type === 'favorites'
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-foreground/80 hover:bg-muted',
            )}
          >
            <span className="flex items-center gap-2.5">
              <Star className="size-4 text-amber-500" />
              Preferiti
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {favoritesCount}
            </span>
          </button>
        </div>

        <Separator className="my-2" />

        {/* My Folders */}
        <div className="py-2">
          <div className="mb-1.5 flex items-center justify-between px-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Le mie cartelle
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6"
              onClick={onNewVault}
              title="Nuova cartella"
            >
              <FolderPlus className="size-3.5" />
            </Button>
          </div>

          <div className="space-y-0.5">
            {myVaults.map((vault) => {
              const palette = getVaultColor(vault.color)
              const active =
                selection.type === 'vault' && selection.vaultId === vault.id
              return (
                <button
                  key={vault.id}
                  type="button"
                  onClick={() =>
                    onSelect({ type: 'vault', vaultId: vault.id })
                  }
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors cursor-pointer',
                    active
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-foreground/80 hover:bg-muted',
                  )}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-md',
                        palette.bg,
                        palette.text,
                      )}
                    >
                      <VaultIcon icon={vault.icon} className="size-3.5" />
                    </span>
                    <span className="truncate">{vault.name}</span>
                  </span>

                  <span className="flex items-center gap-1.5 shrink-0">
                    {vault.is_shared && (
                      <span
                        title={`Condivisa con ${vault.member_count - 1} utenti`}
                        className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                      >
                        <Users className="size-2.5" />
                        {vault.member_count}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {vault.credential_count}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Shared With Me Folders */}
        <div className="py-2">
          <div className="mb-1.5 flex items-center justify-between px-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Condivise con me
            </span>
            {sharedWithMe.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {sharedWithMe.length}
              </Badge>
            )}
          </div>

          {sharedWithMe.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground/80">
              Le cartelle condivise con te da altri utenti appariranno qui.
            </p>
          ) : (
            <div className="space-y-0.5">
              {sharedWithMe.map((vault) => {
                const palette = getVaultColor(vault.color)
                const active =
                  selection.type === 'vault' && selection.vaultId === vault.id
                return (
                  <button
                    key={vault.id}
                    type="button"
                    onClick={() =>
                      onSelect({ type: 'vault', vaultId: vault.id })
                    }
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors cursor-pointer',
                      active
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-foreground/80 hover:bg-muted',
                    )}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md',
                          palette.bg,
                          palette.text,
                        )}
                      >
                        <VaultIcon icon={vault.icon} className="size-3.5" />
                      </span>
                      <span className="flex flex-col items-start min-w-0">
                        <span className="truncate w-full text-left leading-tight">
                          {vault.name}
                        </span>
                        <span className="truncate w-full text-left text-[10px] text-muted-foreground">
                          di {vault.owner_name}
                        </span>
                      </span>
                    </span>

                    <span className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {vault.credential_count}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* User Footer */}
      <div className="border-t p-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-muted transition-colors cursor-pointer"
            >
              <Avatar className="size-8">
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight">
                  {user.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="font-medium text-foreground">{user.name}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {user.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onSignOut}>
              <LogOut className="size-4" />
              Disconnetti
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
