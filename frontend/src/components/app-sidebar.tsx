import { useState } from 'react'
import {
  ChevronDown,
  FolderPlus,
  History,
  KeyRound,
  Layers,
  LogOut,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Users,
} from 'lucide-react'
import type { SettingsTab } from '@/components/user-settings-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import { VaultIcon } from '@/components/vault-icon'
import type { Vault } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { getInitials, getVaultColor } from '@/lib/vault-utils'
import { APP_VERSION } from '@/lib/version'

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
  onNewCredential: (vaultId?: string) => void
  onNewVault: () => void
  onEditVault: (vault: Vault) => void
  onShareVault: (vault: Vault) => void
  onOpenAudit: (vault: Vault) => void
  onDeleteVault: (vault: Vault) => void
  onOpenSettings: (tab?: SettingsTab) => void
  onSignOut: () => void
}

interface VaultSidebarMenuItemProps {
  vault: Vault
  active: boolean
  indented?: boolean
  onSelect: () => void
  onNewCredential: () => void
  onEditVault: () => void
  onShareVault: () => void
  onOpenAudit: () => void
  onDeleteVault: () => void
}

function VaultSidebarMenuItem({
  vault,
  active,
  indented = false,
  onSelect,
  onNewCredential,
  onEditVault,
  onShareVault,
  onOpenAudit,
  onDeleteVault,
}: VaultSidebarMenuItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const palette = getVaultColor(vault.color)
  const isOwner = vault.role === 'owner'
  const canWrite = isOwner || vault.role === 'editor'

  return (
    <SidebarMenuItem
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setMenuOpen(true)
      }}
    >
      <SidebarMenuButton
        isActive={active}
        className={cn(
          'h-9 rounded-lg pr-14 group-has-data-[sidebar=menu-action]/menu-item:pr-14 data-[active=true]:bg-violet-500/15 data-[active=true]:font-medium data-[active=true]:text-foreground',
          indented && 'pl-4',
        )}
        onClick={onSelect}
      >
        <VaultIcon
          icon={vault.icon}
          className={cn(
            'size-4 shrink-0',
            active ? 'text-violet-400' : palette.text,
          )}
        />
        <span className="truncate">{vault.name}</span>
        {!indented && vault.is_shared && (
          <Users
            className="ml-auto size-3 shrink-0 text-muted-foreground"
            aria-label={`Condivisa con ${vault.member_count - 1} utenti`}
          />
        )}
      </SidebarMenuButton>

      <SidebarMenuBadge
        className={cn(
          'top-1/2! right-7 -translate-y-1/2 text-xs',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {vault.credential_count}
      </SidebarMenuBadge>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            className="top-1/2! right-1 size-6 -translate-y-1/2 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-foreground"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Opzioni per ${vault.name}`}
            title="Opzioni cartella"
          >
            <MoreHorizontal className="size-4" />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="right"
          sideOffset={6}
          className="w-48"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuLabel className="truncate text-xs text-muted-foreground">
            {vault.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {canWrite && (
            <DropdownMenuItem onClick={onNewCredential}>
              <Plus className="size-4" />
              Nuova credenziale
            </DropdownMenuItem>
          )}
          {isOwner && (
            <DropdownMenuItem onClick={onEditVault}>
              <Pencil className="size-4" />
              Rinomina
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onShareVault}>
            {isOwner ? (
              <>
                <Share2 className="size-4" />
                Condividi
              </>
            ) : (
              <>
                <Users className="size-4" />
                Membri ({vault.member_count})
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenAudit}>
            <History className="size-4" />
            Registro attività
          </DropdownMenuItem>
          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={vault.is_personal}
                onClick={() => {
                  if (!vault.is_personal) onDeleteVault()
                }}
              >
                <Trash2 className="size-4" />
                Cancella
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
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
  onEditVault,
  onShareVault,
  onOpenAudit,
  onDeleteVault,
  onOpenSettings,
  onSignOut,
}: AppSidebarProps) {
  const { theme, toggleTheme } = useTheme()
  const { setOpenMobile } = useSidebar()

  const myVaults = vaults.filter((v) => !v.is_shared_with_me)
  const sharedWithMe = vaults.filter((v) => v.is_shared_with_me)

  const handleSelect = (next: VaultSelection) => {
    onSelect(next)
    setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-3.5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-muted/50 text-foreground">
              <ShieldCheck className="size-4.5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-none tracking-tight">
                Starward Vault
              </h1>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                Vault · v{APP_VERSION}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground"
            title={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
          >
            {theme === 'dark' ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </Button>
        </div>

        <Button
          type="button"
          className="h-9 w-full justify-center gap-2 rounded-lg font-medium shadow-xs"
          onClick={() => {
            setOpenMobile(false)
            onNewCredential()
          }}
        >
          <Plus className="size-4" />
          Nuova credenziale
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={selection.type === 'all'}
                  onClick={() => handleSelect({ type: 'all' })}
                  className="h-9 rounded-lg pr-8 data-[active=true]:bg-violet-500/15 data-[active=true]:font-medium data-[active=true]:text-foreground"
                >
                  <Layers
                    className={cn(
                      'size-4',
                      selection.type === 'all'
                        ? 'text-violet-400'
                        : 'text-muted-foreground',
                    )}
                  />
                  <span>Tutte le credenziali</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-xs text-muted-foreground">
                  {totalCredentialsCount}
                </SidebarMenuBadge>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={selection.type === 'favorites'}
                  onClick={() => handleSelect({ type: 'favorites' })}
                  className="h-9 rounded-lg pr-8 data-[active=true]:bg-violet-500/15 data-[active=true]:font-medium data-[active=true]:text-foreground"
                >
                  <Star className="size-4 text-amber-400" />
                  <span>Preferiti</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-xs text-muted-foreground">
                  {favoritesCount}
                </SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-1" />

        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground">
            Le mie cartelle
          </SidebarGroupLabel>
          <SidebarGroupAction
            title="Nuova cartella"
            onClick={() => {
              setOpenMobile(false)
              onNewVault()
            }}
          >
            <FolderPlus className="size-4 text-muted-foreground" />
            <span className="sr-only">Nuova cartella</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {myVaults.map((vault) => {
                const active =
                  selection.type === 'vault' && selection.vaultId === vault.id
                return (
                  <VaultSidebarMenuItem
                    key={vault.id}
                    vault={vault}
                    active={active}
                    onSelect={() =>
                      handleSelect({ type: 'vault', vaultId: vault.id })
                    }
                    onNewCredential={() => {
                      setOpenMobile(false)
                      onNewCredential(vault.id)
                    }}
                    onEditVault={() => {
                      setOpenMobile(false)
                      onEditVault(vault)
                    }}
                    onShareVault={() => {
                      setOpenMobile(false)
                      onShareVault(vault)
                    }}
                    onOpenAudit={() => {
                      setOpenMobile(false)
                      onOpenAudit(vault)
                    }}
                    onDeleteVault={() => {
                      setOpenMobile(false)
                      onDeleteVault(vault)
                    }}
                  />
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-1" />

        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <div className="flex h-9 items-center justify-between px-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 shrink-0" />
                    <span className="text-xs font-medium">
                      Condivise con me
                    </span>
                  </div>
                  <span className="text-xs font-medium">
                    {sharedWithMe.length}
                  </span>
                </div>
              </SidebarMenuItem>

              {sharedWithMe.map((vault) => {
                const active =
                  selection.type === 'vault' && selection.vaultId === vault.id
                return (
                  <VaultSidebarMenuItem
                    key={vault.id}
                    vault={vault}
                    active={active}
                    indented
                    onSelect={() =>
                      handleSelect({ type: 'vault', vaultId: vault.id })
                    }
                    onNewCredential={() => {
                      setOpenMobile(false)
                      onNewCredential(vault.id)
                    }}
                    onEditVault={() => {
                      setOpenMobile(false)
                      onEditVault(vault)
                    }}
                    onShareVault={() => {
                      setOpenMobile(false)
                      onShareVault(vault)
                    }}
                    onOpenAudit={() => {
                      setOpenMobile(false)
                      onOpenAudit(vault)
                    }}
                    onDeleteVault={() => {
                      setOpenMobile(false)
                      onDeleteVault(vault)
                    }}
                  />
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="rounded-xl data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-full border border-border/60">
                    <AvatarFallback className="rounded-full bg-muted text-xs font-semibold">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                    <span className="truncate text-xs font-semibold">
                      {user.name}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                  <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-0.5">
                    <span className="font-medium text-foreground">
                      {user.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setOpenMobile(false)
                    onOpenSettings('profile')
                  }}
                >
                  <Settings className="size-4" />
                  Impostazioni account
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setOpenMobile(false)
                    onOpenSettings('preferences')
                  }}
                >
                  <Sparkles className="size-4" />
                  Preferenze vault
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setOpenMobile(false)
                    onOpenSettings('api-keys')
                  }}
                >
                  <KeyRound className="size-4" />
                  API Key
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onSignOut}>
                  <LogOut className="size-4" />
                  Disconnetti
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
