import {
  ChevronsUpDown,
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
      <SidebarHeader className="gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-none tracking-tight">
                Starward
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
          className="w-full justify-start gap-2"
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={selection.type === 'all'}
                  onClick={() => handleSelect({ type: 'all' })}
                >
                  <Layers className="size-4" />
                  <span>Tutte le credenziali</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>{totalCredentialsCount}</SidebarMenuBadge>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={selection.type === 'favorites'}
                  onClick={() => handleSelect({ type: 'favorites' })}
                >
                  <Star className="size-4 text-amber-500" />
                  <span>Preferiti</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>{favoritesCount}</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Le mie cartelle</SidebarGroupLabel>
          <SidebarGroupAction
            title="Nuova cartella"
            onClick={() => {
              setOpenMobile(false)
              onNewVault()
            }}
          >
            <FolderPlus className="size-4" />
            <span className="sr-only">Nuova cartella</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {myVaults.map((vault) => {
                const palette = getVaultColor(vault.color)
                const active =
                  selection.type === 'vault' && selection.vaultId === vault.id
                return (
                  <SidebarMenuItem key={vault.id}>
                    <SidebarMenuButton
                      isActive={active}
                      className="pr-8"
                      onClick={() =>
                        handleSelect({ type: 'vault', vaultId: vault.id })
                      }
                    >
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-sm',
                          palette.bg,
                          palette.text,
                        )}
                      >
                        <VaultIcon icon={vault.icon} className="size-3.5" />
                      </span>
                      <span className="truncate">{vault.name}</span>
                      {vault.is_shared && (
                        <Users
                          className="ml-auto size-3 shrink-0 text-muted-foreground"
                          aria-label={`Condivisa con ${vault.member_count - 1} utenti`}
                        />
                      )}
                    </SidebarMenuButton>
                    <SidebarMenuBadge>{vault.credential_count}</SidebarMenuBadge>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="justify-between pr-2">
            <span>Condivise con me</span>
            {sharedWithMe.length > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {sharedWithMe.length}
              </Badge>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {sharedWithMe.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Le cartelle condivise con te da altri utenti appariranno qui.
              </p>
            ) : (
              <SidebarMenu>
                {sharedWithMe.map((vault) => {
                  const palette = getVaultColor(vault.color)
                  const active =
                    selection.type === 'vault' &&
                    selection.vaultId === vault.id
                  return (
                    <SidebarMenuItem key={vault.id}>
                      <SidebarMenuButton
                        size="lg"
                        isActive={active}
                        className="h-10 pr-8"
                        onClick={() =>
                          handleSelect({ type: 'vault', vaultId: vault.id })
                        }
                      >
                        <span
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-md',
                            palette.bg,
                            palette.text,
                          )}
                        >
                          <VaultIcon icon={vault.icon} className="size-3.5" />
                        </span>
                        <div className="grid min-w-0 flex-1 text-left leading-tight">
                          <span className="truncate text-sm font-medium">
                            {vault.name}
                          </span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            di {vault.owner_name}
                          </span>
                        </div>
                      </SidebarMenuButton>
                      <SidebarMenuBadge>
                        {vault.credential_count}
                      </SidebarMenuBadge>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 shrink-0" />
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
