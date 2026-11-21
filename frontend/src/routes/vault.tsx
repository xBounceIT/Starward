import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { AdminPanel } from '@/components/admin-panel'
import { AppSidebar, type VaultSelection } from '@/components/app-sidebar'
import { AuditDialog } from '@/components/audit-dialog'
import { CredentialDetail } from '@/components/credential-detail'
import { CredentialDialog } from '@/components/credential-dialog'
import {
  CredentialList,
  type CredentialListStats,
  type CredentialSortOption,
} from '@/components/credential-list'
import { GroupDetailPanel } from '@/components/group-detail-panel'
import { GroupDialog } from '@/components/group-dialog'
import { ImportVaultDialog } from '@/components/import-vault-dialog'
import { ShareVaultDialog } from '@/components/share-vault-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  UserSettingsDialog,
  type SettingsTab,
} from '@/components/user-settings-dialog'
import { VaultDialog } from '@/components/vault-dialog'
import {
  vaultApi,
  type Credential,
  type Group,
  type UserSettings,
  type UserSummary,
  type Vault,
} from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { getServerSessionFn } from '@/lib/auth-server'
import {
  getSearchableMetadata,
  serializeCredentialTags,
} from '@/lib/credential-types'
import { useTheme } from '@/lib/theme'
import { isRecentlyAdded, type PasswordOptions } from '@/lib/vault-utils'

const LAST_ACCESSED_STORAGE_KEY = 'starward-last-accessed'

export const Route = createFileRoute('/vault')({
  beforeLoad: async () => {
    const session = await getServerSessionFn()
    if (!session?.user) {
      throw redirect({ to: '/login' })
    }
    return { user: session.user }
  },
  component: VaultWorkspace,
})

function VaultWorkspace() {
  const { user: initialUser } = Route.useRouteContext()
  const navigate = useNavigate()
  const { setTheme } = useTheme()

  const [currentUser, setCurrentUser] = useState<UserSummary>(() => ({
    id: initialUser.id,
    email: initialUser.email,
    name: initialUser.name,
    image: initialUser.image ?? null,
    role: 'user',
  }))
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [vaults, setVaults] = useState<Vault[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [allCredentials, setAllCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)

  const [selection, setSelection] = useState<VaultSelection>({ type: 'all' })
  const [selectedCredentialId, setSelectedCredentialId] = useState<
    string | null
  >(null)
  // Parte chiuso: il pannello dettaglio si apre solo quando l'utente
  // seleziona una credenziale (o ne salva una), non subito dopo il login.
  const [detailClosed, setDetailClosed] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sortBy, setSortBy] = useState<CredentialSortOption>('updated_desc')
  const [lastAccessedMap, setLastAccessedMap] = useState<
    Record<string, string>
  >({})

  // Modals & confirmation dialogs state
  const [credDialogOpen, setCredDialogOpen] = useState(false)
  const [credDefaultVaultId, setCredDefaultVaultId] = useState<
    string | undefined
  >(undefined)
  const [editingCredential, setEditingCredential] =
    useState<Credential | null>(null)
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false)
  const [editingVault, setEditingVault] = useState<Vault | null>(null)
  const [vaultDefaultOwnerGroupId, setVaultDefaultOwnerGroupId] = useState<
    string | null
  >(null)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [shareVaultTarget, setShareVaultTarget] = useState<Vault | null>(null)
  const [importVaultTarget, setImportVaultTarget] = useState<Vault | null>(null)
  const [auditVaultTarget, setAuditVaultTarget] = useState<Vault | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('profile')
  const [pendingDeleteCred, setPendingDeleteCred] =
    useState<Credential | null>(null)
  const [pendingDeleteVault, setPendingDeleteVault] = useState<Vault | null>(
    null,
  )
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<Group | null>(
    null,
  )

  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_ACCESSED_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          setLastAccessedMap(parsed)
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }, [])

  const recordAccess = useCallback((credentialId: string) => {
    const nowIso = new Date().toISOString()
    setLastAccessedMap((prev) => {
      const next = { ...prev, [credentialId]: nowIso }
      try {
        localStorage.setItem(LAST_ACCESSED_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }, [])

  const refreshData = useCallback(async () => {
    try {
      const [meProfile, vaultList, groupList, credList, settingsData] =
        await Promise.all([
          vaultApi.me(),
          vaultApi.listVaults(),
          vaultApi.listGroups(),
          vaultApi.listCredentials(),
          vaultApi.getSettings().catch(() => null),
        ])
      setCurrentUser(meProfile)
      setVaults(vaultList)
      setGroups(groupList)
      setAllCredentials(credList)
      if (settingsData) {
        setUserSettings(settingsData)
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore di connessione al backend Rust',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshData()
  }, [refreshData])

  useEffect(() => {
    if (userSettings?.theme) {
      setTheme(userSettings.theme)
    }
  }, [userSettings?.theme, setTheme])

  useEffect(() => {
    if (
      !loading &&
      selection.type === 'admin' &&
      currentUser.role !== 'admin'
    ) {
      setSelection({ type: 'all' })
    }
  }, [loading, selection.type, currentUser.role])

  const defaultPasswordOptions: PasswordOptions | undefined = useMemo(() => {
    if (!userSettings) return undefined
    return {
      length: userSettings.password_generator_length,
      uppercase: userSettings.password_generator_uppercase,
      lowercase: userSettings.password_generator_lowercase,
      numbers: userSettings.password_generator_numbers,
      symbols: userSettings.password_generator_symbols,
    }
  }, [userSettings])

  const activeVault = useMemo(() => {
    if (selection.type !== 'vault') return null
    return vaults.find((v) => v.id === selection.vaultId) ?? null
  }, [vaults, selection])

  const activeGroup = useMemo(() => {
    if (selection.type !== 'group') return null
    return groups.find((g) => g.id === selection.groupId) ?? null
  }, [groups, selection])

  useEffect(() => {
    if (!loading && selection.type === 'group' && !activeGroup) {
      setSelection({ type: 'all' })
    }
  }, [loading, selection.type, activeGroup])

  const scopedCredentials = useMemo(() => {
    if (selection.type === 'vault') {
      return allCredentials.filter((c) => c.vault_id === selection.vaultId)
    }
    return allCredentials
  }, [allCredentials, selection])

  const stats: CredentialListStats = useMemo(
    () => ({
      total: scopedCredentials.length,
      favorites: scopedCredentials.filter((c) => c.favorite).length,
      vaults: vaults.length,
      recent: scopedCredentials.filter((c) =>
        isRecentlyAdded(c.created_at, 7),
      ).length,
    }),
    [scopedCredentials, vaults.length],
  )

  const filteredCredentials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const matching = allCredentials.filter((cred) => {
      if (selection.type === 'favorites' && !cred.favorite) return false
      if (selection.type === 'vault' && cred.vault_id !== selection.vaultId)
        return false
      if (categoryFilter && cred.category !== categoryFilter) return false
      if (q) {
        const hay =
          `${cred.title} ${cred.username} ${cred.url} ${cred.vault_name} ${getSearchableMetadata(cred)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    return [...matching].sort((a, b) => {
      switch (sortBy) {
        case 'created_desc':
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        case 'title_asc':
          return a.title.localeCompare(b.title, 'it')
        case 'title_desc':
          return b.title.localeCompare(a.title, 'it')
        case 'updated_desc':
        default:
          return (
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          )
      }
    })
  }, [allCredentials, selection, searchQuery, categoryFilter, sortBy])

  const selectedCredential = useMemo(() => {
    if (detailClosed) return null
    return (
      filteredCredentials.find((c) => c.id === selectedCredentialId) ??
      filteredCredentials[0] ??
      null
    )
  }, [filteredCredentials, selectedCredentialId, detailClosed])

  const favoritesCount = useMemo(
    () => allCredentials.filter((c) => c.favorite).length,
    [allCredentials],
  )

  const handleSelectNavigation = (next: VaultSelection) => {
    setSelection(next)
    setMobileDetailOpen(false)
  }

  const handleSignOut = async () => {
    await authClient.signOut()
    await navigate({ to: '/login' })
  }

  const confirmDeleteCredential = async () => {
    if (!pendingDeleteCred) return
    const cred = pendingDeleteCred
    setPendingDeleteCred(null)
    try {
      await vaultApi.deleteCredential(cred.id)
      toast.success(`Credenziale "${cred.title}" eliminata`)
      if (selectedCredentialId === cred.id) {
        setSelectedCredentialId(null)
        setMobileDetailOpen(false)
      }
      await refreshData()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore eliminazione credenziale',
      )
    }
  }

  const handleToggleFavorite = async (cred: Credential) => {
    try {
      const updated = await vaultApi.updateCredential(cred.id, {
        favorite: !cred.favorite,
      })
      setAllCredentials((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore aggiornamento preferito',
      )
    }
  }

  const handleUpdateTags = async (cred: Credential, nextTags: string[]) => {
    try {
      const nextFields: Record<string, string> = { ...(cred.fields ?? {}) }
      const serialized = serializeCredentialTags(nextTags)
      if (serialized) {
        nextFields.tags = serialized
      } else {
        delete nextFields.tags
      }
      const updated = await vaultApi.updateCredential(cred.id, {
        fields: nextFields,
      })
      setAllCredentials((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore aggiornamento tag',
      )
    }
  }

  const confirmDeleteVault = async () => {
    if (!pendingDeleteVault) return
    const vault = pendingDeleteVault
    setPendingDeleteVault(null)
    try {
      await vaultApi.deleteVault(vault.id)
      toast.success(`Cartella "${vault.name}" eliminata`)
      if (selection.type === 'vault' && selection.vaultId === vault.id) {
        setSelection({ type: 'all' })
      }
      await refreshData()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore eliminazione cartella',
      )
    }
  }

  const confirmDeleteGroup = async () => {
    if (!pendingDeleteGroup) return
    const group = pendingDeleteGroup
    setPendingDeleteGroup(null)
    try {
      await vaultApi.deleteGroup(group.id)
      toast.success(`Gruppo "${group.name}" eliminato`)
      if (selection.type === 'group' && selection.groupId === group.id) {
        setSelection({ type: 'all' })
      }
      await refreshData()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore eliminazione gruppo',
      )
    }
  }

  const handleVaultUpdated = (updated: Vault) => {
    setVaults((prev) => prev.map((v) => (v.id === updated.id ? updated : v)))
    if (shareVaultTarget?.id === updated.id) {
      setShareVaultTarget(updated)
    }
  }

  const handleGroupUpdated = (updated: Group) => {
    setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)))
  }

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        user={currentUser}
        vaults={vaults}
        groups={groups}
        totalCredentialsCount={allCredentials.length}
        favoritesCount={favoritesCount}
        selection={selection}
        onSelect={handleSelectNavigation}
        onNewCredential={(vaultId) => {
          setCredDefaultVaultId(vaultId)
          setEditingCredential(null)
          setCredDialogOpen(true)
        }}
        onImportVault={(vault) => setImportVaultTarget(vault)}
        onNewVault={() => {
          setEditingVault(null)
          setVaultDefaultOwnerGroupId(null)
          setVaultDialogOpen(true)
        }}
        onEditVault={(vault) => {
          setEditingVault(vault)
          setVaultDefaultOwnerGroupId(null)
          setVaultDialogOpen(true)
        }}
        onShareVault={(vault) => setShareVaultTarget(vault)}
        onOpenAudit={(vault) => setAuditVaultTarget(vault)}
        onDeleteVault={(vault) => setPendingDeleteVault(vault)}
        onNewGroup={() => {
          setEditingGroup(null)
          setGroupDialogOpen(true)
        }}
        onEditGroup={(group) => {
          setEditingGroup(group)
          setGroupDialogOpen(true)
        }}
        onDeleteGroup={(group) => setPendingDeleteGroup(group)}
        onNewGroupVault={(group) => {
          setEditingVault(null)
          setVaultDefaultOwnerGroupId(group.id)
          setVaultDialogOpen(true)
        }}
        onOpenSettings={(tab = 'profile') => {
          setSettingsTab(tab)
          setSettingsOpen(true)
        }}
        onSignOut={handleSignOut}
      />

      <SidebarInset className="flex h-svh min-h-0 flex-col overflow-hidden">
        {/* Mobile & Tablet Header */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b px-3 sync-security:border-white/20 sync-security:bg-[#000c20] lg:hidden">
          <div className="flex items-center gap-2">
            {selection.type !== 'admin' &&
            selection.type !== 'group' &&
            mobileDetailOpen ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileDetailOpen(false)}
              >
                <ArrowLeft className="size-4" />
                Lista
              </Button>
            ) : (
              <>
                <SidebarTrigger className="md:hidden" />
                <Separator
                  orientation="vertical"
                  className="mr-1 h-4 md:hidden"
                />
              </>
            )}
            <span className="font-serif text-sm font-semibold">
              {selection.type === 'admin'
                ? 'Pannello Admin'
                : selection.type === 'group' && activeGroup
                  ? `Gruppo · ${activeGroup.name}`
                  : 'Starward Vault'}
            </span>
          </div>
          {selection.type !== 'admin' && selection.type !== 'group' && (
            <Button
              size="sm"
              onClick={() => {
                setEditingCredential(null)
                setCredDialogOpen(true)
              }}
            >
              Nuova
            </Button>
          )}
        </header>

        {selection.type === 'admin' && currentUser.role === 'admin' ? (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <AdminPanel
              currentUser={currentUser}
              activeTab={selection.tab}
              onUsersChanged={refreshData}
            />
          </div>
        ) : selection.type === 'group' && activeGroup ? (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <GroupDetailPanel
              group={activeGroup}
              vaults={vaults}
              currentUserId={currentUser.id}
              onGroupUpdated={handleGroupUpdated}
              onLeftGroup={async () => {
                setSelection({ type: 'all' })
                await refreshData()
              }}
              onEditGroup={(group) => {
                setEditingGroup(group)
                setGroupDialogOpen(true)
              }}
              onDeleteGroup={(group) => setPendingDeleteGroup(group)}
              onNewGroupVault={(group) => {
                setEditingVault(null)
                setVaultDefaultOwnerGroupId(group.id)
                setVaultDialogOpen(true)
              }}
              onSelectVault={(vaultId) =>
                handleSelectNavigation({ type: 'vault', vaultId })
              }
              onDataChanged={refreshData}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Center Credential List */}
            <div
              className={
                mobileDetailOpen
                  ? 'hidden h-full min-w-0 flex-1 lg:flex'
                  : 'flex h-full min-w-0 flex-1'
              }
            >
              <CredentialList
                selection={selection}
                activeVault={activeVault}
                credentials={filteredCredentials}
                stats={stats}
                selectedCredentialId={selectedCredential?.id ?? null}
                searchQuery={searchQuery}
                categoryFilter={categoryFilter}
                sortBy={sortBy}
                loading={loading}
                onSearchChange={setSearchQuery}
                onCategoryFilterChange={setCategoryFilter}
                onSortChange={setSortBy}
                onSelectCredential={(cred) => {
                  setSelectedCredentialId(cred.id)
                  setDetailClosed(false)
                  setMobileDetailOpen(true)
                  recordAccess(cred.id)
                }}
                onToggleFavorite={handleToggleFavorite}
                onEditCredential={(cred) => {
                  setEditingCredential(cred)
                  setCredDialogOpen(true)
                }}
                onDeleteCredential={(cred) => setPendingDeleteCred(cred)}
                onNewCredential={() => {
                  setEditingCredential(null)
                  setCredDialogOpen(true)
                }}
                onImportVault={(vault) => setImportVaultTarget(vault)}
                onShareVault={(vault) => setShareVaultTarget(vault)}
                onEditVault={(vault) => {
                  setEditingVault(vault)
                  setVaultDialogOpen(true)
                }}
                onDeleteVault={(vault) => setPendingDeleteVault(vault)}
                onOpenAudit={(vault) => setAuditVaultTarget(vault)}
              />
            </div>

            {/* Right Detail Panel */}
            {!detailClosed && (
              <div
                className={
                  mobileDetailOpen
                    ? 'flex h-full w-full lg:w-auto'
                    : 'hidden h-full lg:flex'
                }
              >
                <CredentialDetail
                  credential={selectedCredential}
                  lastAccessedAt={
                    selectedCredential
                      ? lastAccessedMap[selectedCredential.id]
                      : undefined
                  }
                  onEdit={(cred) => {
                    setEditingCredential(cred)
                    setCredDialogOpen(true)
                  }}
                  onDelete={(cred) => setPendingDeleteCred(cred)}
                  onToggleFavorite={handleToggleFavorite}
                  onUpdateTags={handleUpdateTags}
                  onSelectVault={(vaultId) =>
                    handleSelectNavigation({ type: 'vault', vaultId })
                  }
                  onClose={() => {
                    setMobileDetailOpen(false)
                    setDetailClosed(true)
                    setSelectedCredentialId(null)
                  }}
                />
              </div>
            )}
          </div>
        )}
      </SidebarInset>

      {/* Dialogs */}
      <CredentialDialog
        open={credDialogOpen}
        onOpenChange={(open) => {
          setCredDialogOpen(open)
          if (!open) setCredDefaultVaultId(undefined)
        }}
        vaults={vaults}
        defaultVaultId={
          credDefaultVaultId ??
          (selection.type === 'vault'
            ? selection.vaultId
            : (userSettings?.default_vault_id ?? undefined))
        }
        defaultPasswordOptions={defaultPasswordOptions}
        editingCredential={editingCredential}
        onSaved={async (saved) => {
          await refreshData()
          setSelectedCredentialId(saved.id)
          setDetailClosed(false)
          recordAccess(saved.id)
        }}
      />

      <UserSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialTab={settingsTab}
        user={currentUser}
        vaults={vaults}
        settings={userSettings}
        onUserUpdated={(updated) => {
          setCurrentUser((prev) => ({
            ...prev,
            name: updated.name,
            email: updated.email,
            image: updated.image,
          }))
        }}
        onSettingsUpdated={(updated) => {
          setUserSettings(updated)
        }}
      />

      <VaultDialog
        open={vaultDialogOpen}
        onOpenChange={(open) => {
          setVaultDialogOpen(open)
          if (!open) setVaultDefaultOwnerGroupId(null)
        }}
        editingVault={editingVault}
        groups={groups}
        defaultOwnerGroupId={vaultDefaultOwnerGroupId}
        onSaved={async (saved) => {
          await refreshData()
          setSelection({ type: 'vault', vaultId: saved.id })
        }}
      />

      <GroupDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        editingGroup={editingGroup}
        onSaved={async (saved) => {
          await refreshData()
          setSelection({ type: 'group', groupId: saved.id })
        }}
      />

      <ShareVaultDialog
        open={Boolean(shareVaultTarget)}
        onOpenChange={(open) => {
          if (!open) setShareVaultTarget(null)
        }}
        vault={shareVaultTarget}
        currentUserId={currentUser.id}
        onVaultUpdated={handleVaultUpdated}
        onLeftVault={async (leftVaultId) => {
          if (
            selection.type === 'vault' &&
            selection.vaultId === leftVaultId
          ) {
            setSelection({ type: 'all' })
          }
          await refreshData()
        }}
      />

      <AuditDialog
        open={Boolean(auditVaultTarget)}
        onOpenChange={(open) => {
          if (!open) setAuditVaultTarget(null)
        }}
        vault={auditVaultTarget}
      />

      <ImportVaultDialog
        open={Boolean(importVaultTarget)}
        onOpenChange={(open) => {
          if (!open) setImportVaultTarget(null)
        }}
        vault={importVaultTarget}
        vaults={vaults}
        onImported={async (vaultId) => {
          await refreshData()
          setSelection({ type: 'vault', vaultId })
        }}
      />

      {/* Delete Credential Confirmation */}
      <AlertDialog
        open={Boolean(pendingDeleteCred)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteCred(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa credenziale?</AlertDialogTitle>
            <AlertDialogDescription>
              La credenziale{' '}
              <strong className="text-foreground">
                "{pendingDeleteCred?.title}"
              </strong>{' '}
              verrà eliminata definitivamente dal vault. Questa azione non può
              essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteCredential}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Vault Confirmation */}
      <AlertDialog
        open={Boolean(pendingDeleteVault)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteVault(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa cartella?</AlertDialogTitle>
            <AlertDialogDescription>
              La cartella{' '}
              <strong className="text-foreground">
                "{pendingDeleteVault?.name}"
              </strong>{' '}
              e tutte le credenziali al suo interno verranno eliminate
              definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteVault}
            >
              Elimina cartella
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Delete Group Confirmation */}
      <AlertDialog
        open={Boolean(pendingDeleteGroup)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteGroup(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo gruppo?</AlertDialogTitle>
            <AlertDialogDescription>
              Il gruppo{' '}
              <strong className="text-foreground">
                "{pendingDeleteGroup?.name}"
              </strong>{' '}
              verrà eliminato. Le condivisioni delle cartelle verso questo
              gruppo saranno revocate, mentre eventuali cartelle create a nome
              del gruppo torneranno di proprietà del loro creatore senza
              perdita di credenziali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteGroup}
            >
              Elimina gruppo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  )
}
