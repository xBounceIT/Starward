import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Menu, X } from 'lucide-react'
import { toast } from 'sonner'
import { AppSidebar, type VaultSelection } from '@/components/app-sidebar'
import { AuditDialog } from '@/components/audit-dialog'
import { CredentialDetail } from '@/components/credential-detail'
import { CredentialDialog } from '@/components/credential-dialog'
import { CredentialList } from '@/components/credential-list'
import { ShareVaultDialog } from '@/components/share-vault-dialog'
import { Button } from '@/components/ui/button'
import { VaultDialog } from '@/components/vault-dialog'
import { vaultApi, type Credential, type Vault } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { getServerSessionFn } from '@/lib/auth-server'

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
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()

  const [vaults, setVaults] = useState<Vault[]>([])
  const [allCredentials, setAllCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)

  const [selection, setSelection] = useState<VaultSelection>({ type: 'all' })
  const [selectedCredentialId, setSelectedCredentialId] = useState<
    string | null
  >(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  // Modals state
  const [credDialogOpen, setCredDialogOpen] = useState(false)
  const [editingCredential, setEditingCredential] =
    useState<Credential | null>(null)
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false)
  const [editingVault, setEditingVault] = useState<Vault | null>(null)
  const [shareVaultTarget, setShareVaultTarget] = useState<Vault | null>(null)
  const [auditVaultTarget, setAuditVaultTarget] = useState<Vault | null>(null)

  // Responsive mobile drawer & theme
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('starward-theme')
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches
    const isDark = saved ? saved === 'dark' : prefersDark
    setDarkMode(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      localStorage.setItem('starward-theme', next ? 'dark' : 'light')
      return next
    })
  }

  const refreshData = useCallback(async () => {
    try {
      const [vaultList, credList] = await Promise.all([
        vaultApi.listVaults(),
        vaultApi.listCredentials(),
      ])
      setVaults(vaultList)
      setAllCredentials(credList)
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

  const activeVault = useMemo(() => {
    if (selection.type !== 'vault') return null
    return vaults.find((v) => v.id === selection.vaultId) ?? null
  }, [vaults, selection])

  const filteredCredentials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return allCredentials.filter((cred) => {
      if (selection.type === 'favorites' && !cred.favorite) return false
      if (selection.type === 'vault' && cred.vault_id !== selection.vaultId)
        return false
      if (categoryFilter && cred.category !== categoryFilter) return false
      if (q) {
        const hay =
          `${cred.title} ${cred.username} ${cred.url} ${cred.vault_name}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allCredentials, selection, searchQuery, categoryFilter])

  const selectedCredential = useMemo(
    () =>
      filteredCredentials.find((c) => c.id === selectedCredentialId) ??
      filteredCredentials[0] ??
      null,
    [filteredCredentials, selectedCredentialId],
  )

  const favoritesCount = useMemo(
    () => allCredentials.filter((c) => c.favorite).length,
    [allCredentials],
  )

  const handleSelectNavigation = (next: VaultSelection) => {
    setSelection(next)
    setMobileMenuOpen(false)
    setMobileDetailOpen(false)
  }

  const handleSignOut = async () => {
    await authClient.signOut()
    await navigate({ to: '/login' })
  }

  const handleDeleteCredential = async (cred: Credential) => {
    if (!window.confirm(`Eliminare la credenziale "${cred.title}"?`)) return
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

  const handleDeleteVault = async (vault: Vault) => {
    if (
      !window.confirm(
        `Eliminare la cartella "${vault.name}" e tutte le credenziali al suo interno?`,
      )
    ) {
      return
    }
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

  const handleVaultUpdated = (updated: Vault) => {
    setVaults((prev) => prev.map((v) => (v.id === updated.id ? updated : v)))
    if (shareVaultTarget?.id === updated.id) {
      setShareVaultTarget(updated)
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Mobile Header */}
      <header className="flex items-center justify-between border-b px-3 py-2.5 lg:hidden">
        <div className="flex items-center gap-2">
          {mobileDetailOpen ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileDetailOpen(false)}
            >
              <ArrowLeft className="size-4" />
              Lista
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              {mobileMenuOpen ? (
                <X className="size-5" />
              ) : (
                <Menu className="size-5" />
              )}
            </Button>
          )}
          <span className="font-semibold text-sm">Starward Vault</span>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingCredential(null)
            setCredDialogOpen(true)
          }}
        >
          Nuova
        </Button>
      </header>

      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:flex h-full">
          <AppSidebar
            user={user}
            vaults={vaults}
            totalCredentialsCount={allCredentials.length}
            favoritesCount={favoritesCount}
            selection={selection}
            onSelect={handleSelectNavigation}
            onNewCredential={() => {
              setEditingCredential(null)
              setCredDialogOpen(true)
            }}
            onNewVault={() => {
              setEditingVault(null)
              setVaultDialogOpen(true)
            }}
            onSignOut={handleSignOut}
            darkMode={darkMode}
            onToggleDarkMode={toggleDarkMode}
          />
        </div>

        {/* Mobile Drawer Sidebar */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative z-50 flex h-full bg-background shadow-xl">
              <AppSidebar
                user={user}
                vaults={vaults}
                totalCredentialsCount={allCredentials.length}
                favoritesCount={favoritesCount}
                selection={selection}
                onSelect={handleSelectNavigation}
                onNewCredential={() => {
                  setMobileMenuOpen(false)
                  setEditingCredential(null)
                  setCredDialogOpen(true)
                }}
                onNewVault={() => {
                  setMobileMenuOpen(false)
                  setEditingVault(null)
                  setVaultDialogOpen(true)
                }}
                onSignOut={handleSignOut}
                darkMode={darkMode}
                onToggleDarkMode={toggleDarkMode}
              />
            </div>
          </div>
        )}

        {/* Center Credential List */}
        <div
          className={
            mobileDetailOpen
              ? 'hidden lg:flex h-full'
              : 'flex flex-1 lg:flex-none h-full min-w-0'
          }
        >
          <CredentialList
            selection={selection}
            activeVault={activeVault}
            credentials={filteredCredentials}
            selectedCredentialId={selectedCredential?.id ?? null}
            searchQuery={searchQuery}
            categoryFilter={categoryFilter}
            loading={loading}
            onSearchChange={setSearchQuery}
            onCategoryFilterChange={setCategoryFilter}
            onSelectCredential={(cred) => {
              setSelectedCredentialId(cred.id)
              setMobileDetailOpen(true)
            }}
            onNewCredential={() => {
              setEditingCredential(null)
              setCredDialogOpen(true)
            }}
            onShareVault={(vault) => setShareVaultTarget(vault)}
            onEditVault={(vault) => {
              setEditingVault(vault)
              setVaultDialogOpen(true)
            }}
            onDeleteVault={handleDeleteVault}
            onOpenAudit={(vault) => setAuditVaultTarget(vault)}
          />
        </div>

        {/* Right Detail Panel */}
        <div
          className={
            mobileDetailOpen
              ? 'flex flex-1 h-full min-w-0'
              : 'hidden lg:flex flex-1 h-full min-w-0'
          }
        >
          <CredentialDetail
            credential={selectedCredential}
            onEdit={(cred) => {
              setEditingCredential(cred)
              setCredDialogOpen(true)
            }}
            onDelete={handleDeleteCredential}
            onToggleFavorite={handleToggleFavorite}
            onSelectVault={(vaultId) =>
              handleSelectNavigation({ type: 'vault', vaultId })
            }
          />
        </div>
      </div>

      {/* Dialogs */}
      <CredentialDialog
        open={credDialogOpen}
        onOpenChange={setCredDialogOpen}
        vaults={vaults}
        defaultVaultId={
          selection.type === 'vault' ? selection.vaultId : undefined
        }
        editingCredential={editingCredential}
        onSaved={async (saved) => {
          await refreshData()
          setSelectedCredentialId(saved.id)
        }}
      />

      <VaultDialog
        open={vaultDialogOpen}
        onOpenChange={setVaultDialogOpen}
        editingVault={editingVault}
        onSaved={async (saved) => {
          await refreshData()
          setSelection({ type: 'vault', vaultId: saved.id })
        }}
      />

      <ShareVaultDialog
        open={Boolean(shareVaultTarget)}
        onOpenChange={(open) => {
          if (!open) setShareVaultTarget(null)
        }}
        vault={shareVaultTarget}
        currentUserId={user.id}
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
    </div>
  )
}
