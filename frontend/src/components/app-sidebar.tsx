import { useCallback, useEffect, useState } from 'react'
import {
  Bot,
  ChevronDown,
  ChevronRight,
  FileClock,
  FolderPlus,
  History,
  Layers,
  LogOut,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Plus,
  Settings,
  Share2,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  User,
  Users,
} from 'lucide-react'
import type { AdminPanelTab } from '@/components/admin-panel'
import type { SettingsTab } from '@/components/user-settings-dialog'
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
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import { getVaultDisplayIcon, VaultIcon } from '@/components/vault-icon'
import type { Group, UserRole, Vault } from '@/lib/api'
import { cn } from '@/lib/utils'
import { getInitials, getVaultColor } from '@/lib/vault-utils'
import { APP_VERSION } from '@/lib/version'

// Geometria condivisa per gli elementi in coda alle righe della sidebar:
// badge e pulsante "..." occupano la stessa area (right-1, 24px di lato) così
// il loro centro cade sulla stessa verticale; le azioni di gruppo usano
// right-3 rispetto al gruppo (che ha p-2), cioè la stessa colonna delle "...".
const menuTrailingBadgeClass =
  'top-1/2! right-1 h-6 min-w-6 -translate-y-1/2 text-xs'
// top-2 allinea il centro del pulsante (8+12=20px) al centro del label
// del gruppo (py-1 + h-8/2 = 4+16=20px)
const groupActionClass = 'top-2 right-3 h-6 w-6'

// Larghezza fissa del contenuto interno su desktop (256px - 1px border-r)
// così testo e pulsanti non vanno a capo né si comprimono durante il collapse
const sidebarInnerWidthClass = 'w-full md:w-[calc(var(--sidebar-width)-1px)]'
// Fade asimmetrico sincronizzato con l'animazione width (250ms):
// in chiusura svanisce rapidamente (150ms), in apertura riappare con un lieve ritardo (75ms)
const collapsibleFadeClass =
  'transition-opacity duration-200 delay-75 ease-out group-data-[collapsible=strip]:pointer-events-none group-data-[collapsible=strip]:opacity-0 group-data-[collapsible=strip]:duration-150 group-data-[collapsible=strip]:delay-0'

// Stato di collasso dei gruppi nella sidebar, persistito in localStorage
const COLLAPSED_GROUPS_STORAGE_KEY = 'starward-collapsed-groups'

export type VaultSelection =
  | { type: 'all' }
  | { type: 'favorites' }
  | { type: 'vault'; vaultId: string }
  | { type: 'group'; groupId: string }
  | { type: 'admin'; tab: AdminPanelTab }

interface AppSidebarProps {
  user: { id: string; name: string; email: string; role?: UserRole }
  vaults: Vault[]
  groups: Group[]
  totalCredentialsCount: number
  favoritesCount: number
  selection: VaultSelection
  onSelect: (selection: VaultSelection) => void
  onNewCredential: (vaultId?: string) => void
  onImportVault: (vault: Vault) => void
  onNewVault: () => void
  onEditVault: (vault: Vault) => void
  onShareVault: (vault: Vault) => void
  onOpenAudit: (vault: Vault) => void
  onDeleteVault: (vault: Vault) => void
  onNewGroup: () => void
  onEditGroup: (group: Group) => void
  onDeleteGroup: (group: Group) => void
  onNewGroupVault: (group: Group) => void
  onOpenSettings: (tab?: SettingsTab) => void
  onSignOut: () => void
}

interface VaultSidebarMenuItemProps {
  vault: Vault
  active: boolean
  indented?: boolean
  showGroupBadge?: boolean
  onSelect: () => void
  onNewCredential: () => void
  onImportVault: () => void
  onEditVault: () => void
  onShareVault: () => void
  onOpenAudit: () => void
  onDeleteVault: () => void
}

function VaultSidebarMenuItem({
  vault,
  active,
  indented = false,
  showGroupBadge = false,
  onSelect,
  onNewCredential,
  onImportVault,
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
          'h-9 pr-14 group-has-data-[sidebar=menu-action]/menu-item:pr-14 rounded-md sync-security:data-[active=true]:bg-[#0e1b33] data-[active=true]:font-semibold sync-security:data-[active=true]:text-[#ff9c00]',
          indented && 'pl-4',
        )}
        onClick={onSelect}
      >
        <VaultIcon
          icon={getVaultDisplayIcon(vault)}
          className={cn(
            'size-4 shrink-0',
            active
              ? 'text-sidebar-accent-foreground sync-security:text-[#ff9c00]'
              : palette.text,
          )}
        />
        <span className="truncate">{vault.name}</span>
        {showGroupBadge && vault.owner_group_name && (
          <span
            className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground"
            title={`Cartella del gruppo ${vault.owner_group_name}`}
          >
            {vault.owner_group_name}
          </span>
        )}
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
            <>
              <DropdownMenuItem onClick={onNewCredential}>
                <Plus className="size-4" />
                Nuova credenziale
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onImportVault}>
                <Upload className="size-4" />
                Importa credenziali
              </DropdownMenuItem>
            </>
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

interface GroupSidebarMenuItemProps {
  group: Group
  active: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelect: () => void
  onNewGroupVault: () => void
  onEditGroup: () => void
  onDeleteGroup: () => void
}

function GroupSidebarMenuItem({
  group,
  active,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onNewGroupVault,
  onEditGroup,
  onDeleteGroup,
}: GroupSidebarMenuItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const palette = getVaultColor(group.color)

  return (
    <SidebarMenuItem
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setMenuOpen(true)
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleCollapsed()
        }}
        aria-expanded={!collapsed}
        aria-label={
          collapsed
            ? `Espandi le cartelle del gruppo ${group.name}`
            : `Comprimi le cartelle del gruppo ${group.name}`
        }
        title={
          collapsed
            ? 'Espandi cartelle del gruppo'
            : 'Comprimi cartelle del gruppo'
        }
        className="absolute left-1 top-1/2 z-10 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      >
        <ChevronRight
          className={cn(
            'size-3.5 transition-transform duration-200',
            !collapsed && 'rotate-90',
          )}
        />
      </button>
      <SidebarMenuButton
        isActive={active}
        className="h-9 rounded-lg pl-7 pr-14 group-has-data-[sidebar=menu-action]/menu-item:pr-14 sync-security:data-[active=true]:bg-[#ff9c00]/15"
        onClick={onSelect}
      >
        <Users
          className={cn(
            'size-4 shrink-0',
            active
              ? 'text-sidebar-accent-foreground sync-security:text-[#ff9c00]'
              : palette.text,
          )}
        />
        <span className="truncate font-medium">{group.name}</span>
      </SidebarMenuButton>

      <SidebarMenuBadge
        className={cn(
          'top-1/2! right-7 -translate-y-1/2 text-xs',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
        title={`${group.member_count} ${group.member_count === 1 ? 'membro' : 'membri'}`}
      >
        {group.member_count}
      </SidebarMenuBadge>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            className="top-1/2! right-1 size-6 -translate-y-1/2 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-foreground"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Opzioni per il gruppo ${group.name}`}
            title="Opzioni gruppo"
          >
            <MoreHorizontal className="size-4" />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="right"
          sideOffset={6}
          className="w-52"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuLabel className="truncate text-xs text-muted-foreground">
            Gruppo · {group.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onNewGroupVault}>
            <FolderPlus className="size-4" />
            Nuova cartella del gruppo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSelect}>
            <Users className="size-4" />
            Membri e cartelle ({group.member_count})
          </DropdownMenuItem>
          {group.can_manage && (
            <>
              <DropdownMenuItem onClick={onEditGroup}>
                <Pencil className="size-4" />
                Modifica gruppo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDeleteGroup}>
                <Trash2 className="size-4" />
                Elimina gruppo
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

// Variante di PanelLeft (lucide) con solo la colonna sinistra piena:
// riquadro + divisore in stroke, pannello sinistro riempito.
function PanelLeftFilled({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M5 3h4v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        fill="currentColor"
        stroke="none"
      />
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

export function AppSidebar({
  user,
  vaults,
  groups,
  totalCredentialsCount,
  favoritesCount,
  selection,
  onSelect,
  onNewCredential,
  onImportVault,
  onNewVault,
  onEditVault,
  onShareVault,
  onOpenAudit,
  onDeleteVault,
  onNewGroup,
  onEditGroup,
  onDeleteGroup,
  onNewGroupVault,
  onOpenSettings,
  onSignOut,
}: AppSidebarProps) {
  const { isMobile, openMobile, state, setOpenMobile, toggleSidebar } =
    useSidebar()

  // Su desktop lo stato è "collapsed" quando la sidebar è chiusa;
  // su mobile la sidebar è una sheet e conta openMobile.
  const sidebarCollapsed = isMobile ? !openMobile : state === 'collapsed'

  // Gruppi collassati nella sidebar, persistiti in localStorage
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<
    ReadonlySet<string>
  >(() => new Set())

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          setCollapsedGroupIds(
            new Set(parsed.filter((id) => typeof id === 'string')),
          )
        }
      }
    } catch {
      // ignora errori di lettura dello storage
    }
  }, [])

  const toggleGroupCollapsed = useCallback((groupId: string) => {
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      try {
        localStorage.setItem(
          COLLAPSED_GROUPS_STORAGE_KEY,
          JSON.stringify([...next]),
        )
      } catch {
        // ignora errori di scrittura dello storage
      }
      return next
    })
  }, [])

  const myVaults = vaults.filter((v) => !v.owner_group_id && !v.is_shared_with_me)
  // "Condivise con me": cartelle condivise con l'utente + tutte le cartelle dei gruppi
  const sharedWithMe = vaults.filter(
    (v) => v.is_shared_with_me || v.owner_group_id !== null,
  )

  const handleSelect = (next: VaultSelection) => {
    onSelect(next)
    setOpenMobile(false)
  }

  // Icona del toggle: colonna sinistra piena quando la sidebar è visibile,
  // solo contorno quando è collassata
  const toggleIcon = sidebarCollapsed ? (
    <PanelLeft className="size-4" />
  ) : (
    <PanelLeftFilled className="size-4" />
  )

  const toggleLabel = sidebarCollapsed ? 'Espandi sidebar' : 'Comprimi sidebar'

  return (
    // collapsible="strip": quando la sidebar collassa resta una striscia
    // dedicata di 3rem che contiene il toggle, così il contenuto della
    // pagina non va mai sotto il pulsante.
    <Sidebar collapsible="strip">
      <div className="flex h-full w-full flex-col overflow-hidden">
        <SidebarHeader
          className={cn(
            sidebarInnerWidthClass,
            'shrink-0 gap-3.5 border-b border-sidebar-border p-3.5 transition-colors duration-200 group-data-[collapsible=strip]:border-transparent sync-security:border-white/20 sync-security:group-data-[collapsible=strip]:border-transparent',
          )}
        >
          {/* mt-1 allinea il centro del toggle (p-3.5 + mt-1 + size-8/2 = 34px)
              al centro dell'icona del titolo pagina (pt-5 + 28/2 = 34px);
              stessa posizione in modalità espansa e collassata, così il
              pulsante non si sposta durante l'animazione */}
          <div className="mt-1 flex items-center justify-start">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-ml-1.5 text-muted-foreground hover:text-foreground"
              onClick={toggleSidebar}
              title={toggleLabel}
              aria-label={toggleLabel}
              aria-expanded={!sidebarCollapsed}
            >
              {toggleIcon}
            </Button>
          </div>

          <div
            inert={sidebarCollapsed}
            aria-hidden={sidebarCollapsed || undefined}
            className={collapsibleFadeClass}
          >
            <Button
              type="button"
              className="h-9 w-full justify-center gap-2 font-medium shadow-xs"
              onClick={() => {
                setOpenMobile(false)
                onNewCredential()
              }}
            >
              <Plus className="size-4" />
              Nuova credenziale
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent
          inert={sidebarCollapsed}
          aria-hidden={sidebarCollapsed || undefined}
          className={cn(sidebarInnerWidthClass, collapsibleFadeClass)}
        >
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={selection.type === 'all'}
                  onClick={() => handleSelect({ type: 'all' })}
                  className="h-9 pr-8 rounded-md sync-security:data-[active=true]:bg-[#0e1b33] data-[active=true]:font-semibold sync-security:data-[active=true]:text-[#ff9c00]"
                >
                  <Layers
                    className={cn(
                      'size-4',
                      selection.type === 'all'
                        ? 'text-sidebar-accent-foreground sync-security:text-[#ff9c00]'
                        : 'text-muted-foreground',
                    )}
                  />
                  <span>Tutte le credenziali</span>
                </SidebarMenuButton>
                <SidebarMenuBadge
                  className={cn(menuTrailingBadgeClass, 'text-muted-foreground')}
                >
                  {totalCredentialsCount}
                </SidebarMenuBadge>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={selection.type === 'favorites'}
                  onClick={() => handleSelect({ type: 'favorites' })}
                  className="h-9 pr-8 rounded-md sync-security:data-[active=true]:bg-[#0e1b33] data-[active=true]:font-semibold sync-security:data-[active=true]:text-[#ff9c00]"
                >
                  <Star className="size-4 text-amber-400 sync-security:text-[#ff9c00]" />
                  <span>Preferiti</span>
                </SidebarMenuButton>
                <SidebarMenuBadge
                  className={cn(menuTrailingBadgeClass, 'text-muted-foreground')}
                >
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
            className={groupActionClass}
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
                    onImportVault={() => {
                      setOpenMobile(false)
                      onImportVault(vault)
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
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground">
            Gruppi
          </SidebarGroupLabel>
          <SidebarGroupAction
            className={groupActionClass}
            title="Nuovo gruppo"
            onClick={() => {
              setOpenMobile(false)
              onNewGroup()
            }}
          >
            <Plus className="size-4 text-muted-foreground" />
            <span className="sr-only">Nuovo gruppo</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {groups.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="h-8 rounded-lg text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setOpenMobile(false)
                      onNewGroup()
                    }}
                  >
                    <Plus className="size-3.5" />
                    <span>Crea un gruppo</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                groups.map((group) => {
                  const groupActive =
                    selection.type === 'group' &&
                    selection.groupId === group.id
                  const groupVaults = vaults.filter(
                    (v) => v.owner_group_id === group.id,
                  )
                  const childVaultActive =
                    selection.type === 'vault' &&
                    groupVaults.some((v) => v.id === selection.vaultId)
                  // Se una cartella del gruppo è selezionata, il gruppo resta espanso
                  const collapsed =
                    collapsedGroupIds.has(group.id) && !childVaultActive
                  return (
                    <div key={group.id} className="space-y-0.5">
                      <GroupSidebarMenuItem
                        group={group}
                        active={groupActive}
                        collapsed={collapsed}
                        onToggleCollapsed={() => toggleGroupCollapsed(group.id)}
                        onSelect={() =>
                          handleSelect({ type: 'group', groupId: group.id })
                        }
                        onNewGroupVault={() => {
                          setOpenMobile(false)
                          onNewGroupVault(group)
                        }}
                        onEditGroup={() => {
                          setOpenMobile(false)
                          onEditGroup(group)
                        }}
                        onDeleteGroup={() => {
                          setOpenMobile(false)
                          onDeleteGroup(group)
                        }}
                      />
                      {!collapsed &&
                        groupVaults.map((vault) => {
                          const active =
                            selection.type === 'vault' &&
                            selection.vaultId === vault.id
                          return (
                            <VaultSidebarMenuItem
                              key={vault.id}
                              vault={vault}
                              active={active}
                              indented
                              onSelect={() =>
                                handleSelect({
                                  type: 'vault',
                                  vaultId: vault.id,
                                })
                              }
                              onNewCredential={() => {
                                setOpenMobile(false)
                                onNewCredential(vault.id)
                              }}
                              onImportVault={() => {
                                setOpenMobile(false)
                                onImportVault(vault)
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
                    </div>
                  )
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="my-1" />

        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <div className="flex h-9 items-center gap-2 px-2 pr-8 text-sm text-muted-foreground sync-security:text-[#ff9c00]">
                  <Share2 className="size-4 shrink-0" />
                  <span className="truncate text-[11px] font-bold tracking-[0.14em] uppercase">
                    Condivise con me
                  </span>
                </div>
                <SidebarMenuBadge
                  className={cn(
                    menuTrailingBadgeClass,
                    'text-muted-foreground sync-security:text-white/75',
                  )}
                  title={`${sharedWithMe.length} ${
                    sharedWithMe.length === 1 ? 'cartella condivisa' : 'cartelle condivise'
                  }`}
                >
                  {sharedWithMe.length}
                </SidebarMenuBadge>
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
                    showGroupBadge={vault.owner_group_id !== null}
                    onSelect={() =>
                      handleSelect({ type: 'vault', vaultId: vault.id })
                    }
                    onNewCredential={() => {
                      setOpenMobile(false)
                      onNewCredential(vault.id)
                    }}
                    onImportVault={() => {
                      setOpenMobile(false)
                      onImportVault(vault)
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

        {user.role === 'admin' && (
          <>
            <SidebarSeparator className="my-1" />

            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Pannello Admin</span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={
                        selection.type === 'admin' && selection.tab === 'users'
                      }
                      onClick={() =>
                        handleSelect({ type: 'admin', tab: 'users' })
                      }
                      className="h-9 rounded-md sync-security:data-[active=true]:bg-[#0e1b33] data-[active=true]:font-semibold sync-security:data-[active=true]:text-[#ff9c00]"
                    >
                      <User
                        className={cn(
                          'size-4',
                          selection.type === 'admin' &&
                            selection.tab === 'users'
                            ? 'text-sidebar-accent-foreground sync-security:text-[#ff9c00]'
                            : 'text-muted-foreground',
                        )}
                      />
                      <span>Utenti</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={
                        selection.type === 'admin' && selection.tab === 'groups'
                      }
                      onClick={() =>
                        handleSelect({ type: 'admin', tab: 'groups' })
                      }
                      className="h-9 rounded-lg sync-security:data-[active=true]:bg-[#ff9c00]/15"
                    >
                      <Users
                        className={cn(
                          'size-4',
                          selection.type === 'admin' &&
                            selection.tab === 'groups'
                            ? 'text-sidebar-accent-foreground sync-security:text-[#ff9c00]'
                            : 'text-muted-foreground',
                        )}
                      />
                      <span>Gruppi</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={
                        selection.type === 'admin' &&
                        selection.tab === 'service-accounts'
                      }
                      onClick={() =>
                        handleSelect({
                          type: 'admin',
                          tab: 'service-accounts',
                        })
                      }
                      className="h-9 rounded-lg sync-security:data-[active=true]:bg-[#ff9c00]/15"
                    >
                      <Bot
                        className={cn(
                          'size-4',
                          selection.type === 'admin' &&
                            selection.tab === 'service-accounts'
                            ? 'text-sidebar-accent-foreground sync-security:text-[#ff9c00]'
                            : 'text-muted-foreground',
                        )}
                      />
                      <span>Service Account</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={
                        selection.type === 'admin' && selection.tab === 'audit'
                      }
                      onClick={() =>
                        handleSelect({ type: 'admin', tab: 'audit' })
                      }
                      className="h-9 rounded-md sync-security:data-[active=true]:bg-[#0e1b33] data-[active=true]:font-semibold sync-security:data-[active=true]:text-[#ff9c00]"
                    >
                      <FileClock
                        className={cn(
                          'size-4',
                          selection.type === 'admin' &&
                            selection.tab === 'audit'
                            ? 'text-sidebar-accent-foreground sync-security:text-[#ff9c00]'
                            : 'text-muted-foreground',
                        )}
                      />
                      <span>Audit di sistema</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
        </SidebarContent>

        <div
          aria-hidden={sidebarCollapsed || undefined}
          className={cn(
            sidebarInnerWidthClass,
            collapsibleFadeClass,
            'shrink-0 whitespace-nowrap px-3 py-2 text-left text-[11px] text-muted-foreground sync-security:text-[#ff9c00]/90',
          )}
        >
          Starward v{APP_VERSION}
        </div>

        <SidebarFooter
          inert={sidebarCollapsed}
          aria-hidden={sidebarCollapsed || undefined}
          className={cn(
            sidebarInnerWidthClass,
            collapsibleFadeClass,
            'shrink-0 border-t border-sidebar-border p-2.5',
          )}
        >
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
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold">
                        {user.name}
                      </span>
                      {user.role === 'admin' ? (
                        <Badge
                          variant="secondary"
                          className="h-4 shrink-0 border-amber-500/30 bg-amber-500/15 px-1.5 py-0 text-[9px] font-semibold text-amber-300"
                        >
                          Admin
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="h-4 shrink-0 px-1.5 py-0 text-[9px] text-muted-foreground"
                        >
                          User
                        </Badge>
                      )}
                    </div>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                  <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-foreground">
                        {user.name}
                      </span>
                      {user.role === 'admin' ? (
                        <Badge
                          variant="secondary"
                          className="gap-1 border-amber-500/30 bg-amber-500/15 px-1.5 py-0 text-[10px] font-semibold text-amber-300"
                        >
                          <ShieldCheck className="size-3" />
                          Admin
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="gap-1 px-1.5 py-0 text-[10px] text-muted-foreground"
                        >
                          <User className="size-3" />
                          User
                        </Badge>
                      )}
                    </div>
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
      </div>
      <SidebarRail />
    </Sidebar>
  )
}
