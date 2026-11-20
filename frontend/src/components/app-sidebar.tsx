import {
  ChevronDown,
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
  onNewCredential: () => void
  onNewVault: () => void
  onSignOut: () => void
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
                const palette = getVaultColor(vault.color)
                const active =
                  selection.type === 'vault' && selection.vaultId === vault.id
                return (
                  <SidebarMenuItem key={vault.id}>
                    <SidebarMenuButton
                      isActive={active}
                      className="h-9 rounded-lg pr-8 data-[active=true]:bg-violet-500/15 data-[active=true]:font-medium data-[active=true]:text-foreground"
                      onClick={() =>
                        handleSelect({ type: 'vault', vaultId: vault.id })
                      }
                    >
                      <VaultIcon
                        icon={vault.icon}
                        className={cn(
                          'size-4 shrink-0',
                          active ? 'text-violet-400' : palette.text,
                        )}
                      />
                      <span className="truncate">{vault.name}</span>
                      {vault.is_shared && (
                        <Users
                          className="ml-auto size-3 shrink-0 text-muted-foreground"
                          aria-label={`Condivisa con ${vault.member_count - 1} utenti`}
                        />
                      )}
                    </SidebarMenuButton>
                    <SidebarMenuBadge
                      className={cn(
                        'text-xs',
                        active ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {vault.credential_count}
                    </SidebarMenuBadge>
                  </SidebarMenuItem>
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
                const palette = getVaultColor(vault.color)
                const active =
                  selection.type === 'vault' && selection.vaultId === vault.id
                return (
                  <SidebarMenuItem key={vault.id}>
                    <SidebarMenuButton
                      isActive={active}
                      className="h-9 rounded-lg pr-8 pl-4 data-[active=true]:bg-violet-500/15 data-[active=true]:font-medium data-[active=true]:text-foreground"
                      onClick={() =>
                        handleSelect({ type: 'vault', vaultId: vault.id })
                      }
                    >
                      <VaultIcon
                        icon={vault.icon}
                        className={cn(
                          'size-4 shrink-0',
                          active ? 'text-violet-400' : palette.text,
                        )}
                      />
                      <div className="grid min-w-0 flex-1 text-left leading-tight">
                        <span className="truncate text-sm">{vault.name}</span>
                      </div>
                    </SidebarMenuButton>
                    <SidebarMenuBadge className="text-xs text-muted-foreground">
                      {vault.credential_count}
                    </SidebarMenuBadge>
                  </SidebarMenuItem>
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
