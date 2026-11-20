import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Calendar,
  Clock,
  FileClock,
  Folder,
  KeyRound,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  vaultApi,
  type AdminUser,
  type UserRole,
  type UserSummary,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  formatRelativeDate,
  formatShortDate,
  getInitials,
} from '@/lib/vault-utils'

export type AdminPanelTab = 'users' | 'audit'

interface AdminPanelProps {
  currentUser: UserSummary
  activeTab: AdminPanelTab
  onTabChange: (tab: AdminPanelTab) => void
  onUsersChanged?: () => void
}

export function AdminPanel({
  currentUser,
  activeTab,
  onTabChange,
  onUsersChanged,
}: AdminPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'' | UserRole>('')
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [pendingDeleteUser, setPendingDeleteUser] =
    useState<AdminUser | null>(null)

  const loadUsers = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const list = await vaultApi.listAdminUsers()
      setUsers(list)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore nel caricamento della lista utenti',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const stats = useMemo(() => {
    const total = users.length
    const admins = users.filter((u) => u.role === 'admin').length
    const standardUsers = total - admins
    const totalVaults = users.reduce((acc, u) => acc + u.vault_count, 0)
    return { total, admins, standardUsers, totalVaults }
  }, [users])

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false
      if (q) {
        const hay = `${u.name} ${u.email} ${u.role}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [users, searchQuery, roleFilter])

  const handleRoleChange = async (targetUser: AdminUser, nextRole: UserRole) => {
    if (targetUser.role === nextRole) return
    setBusyUserId(targetUser.id)
    try {
      const updated = await vaultApi.updateUserRole(targetUser.id, nextRole)
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? updated : u)),
      )
      toast.success(
        `Ruolo di ${updated.name} aggiornato a ${
          nextRole === 'admin' ? 'Admin' : 'User'
        }`,
      )
      onUsersChanged?.()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore durante la modifica del ruolo',
      )
    } finally {
      setBusyUserId(null)
    }
  }

  const confirmDeleteUser = async () => {
    if (!pendingDeleteUser) return
    const target = pendingDeleteUser
    setPendingDeleteUser(null)
    setBusyUserId(target.id)
    try {
      await vaultApi.deleteUser(target.id)
      setUsers((prev) => prev.filter((u) => u.id !== target.id))
      toast.success(`Utente "${target.name}" (${target.email}) eliminato`)
      onUsersChanged?.()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Errore durante l'eliminazione dell'utente",
      )
    } finally {
      setBusyUserId(null)
    }
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {/* Top Header & Navigation Tabs */}
      <div className="space-y-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <SidebarTrigger className="-ml-1 hidden shrink-0 md:inline-flex lg:hidden" />
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400 sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]">
                <ShieldCheck className="size-4.5" />
              </div>
              <h2 className="truncate text-xl font-bold tracking-tight">
                Pannello Admin
              </h2>
              <Badge
                variant="secondary"
                className="border-violet-500/30 bg-violet-500/15 text-[11px] font-semibold text-violet-300 sync-security:border-[#ff9c00]/30 sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]"
              >
                RBAC · Admin
              </Badge>
            </div>
            <p className="mt-1 truncate pl-10 text-xs text-muted-foreground">
              Gestione centralizzata degli utenti, controllo accessi basato sui
              ruoli (Admin / User) e audit di sistema.
            </p>
          </div>

          {/* Section Switcher Tabs */}
          <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-card/50 p-1">
            <button
              type="button"
              onClick={() => onTabChange('users')}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-medium transition-colors',
                activeTab === 'users'
                  ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30 sync-security:bg-[#ff9c00]/20 sync-security:text-[#ff9c00] sync-security:ring-[#ff9c00]/40'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Users className="size-3.5" />
              <span>Lista utenti</span>
              <span className="rounded-full bg-background/60 px-1.5 py-0.2 text-[10px]">
                {users.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('audit')}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-medium transition-colors',
                activeTab === 'audit'
                  ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30 sync-security:bg-[#ff9c00]/20 sync-security:text-[#ff9c00] sync-security:ring-[#ff9c00]/40'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <FileClock className="size-3.5" />
              <span>Audit di sistema</span>
              <Badge
                variant="outline"
                className="h-4 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[9px] font-medium text-amber-400"
              >
                Predisposto
              </Badge>
            </button>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400 sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]">
              <Users className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {stats.total}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Utenti registrati
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <ShieldCheck className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {stats.admins}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Amministratori (Admin)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
              <User className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {stats.standardUsers}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Utenti standard (User)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Folder className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {stats.totalVaults}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Cartelle create
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'users' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Users Filter & Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3 sm:px-6">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca utente per nome o email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 rounded-xl border-border/70 bg-card/50 pr-10 pl-10 text-sm"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setSearchQuery('')}
                  className="absolute top-1/2 right-2.5 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Cancella ricerca"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-card/50 p-1">
                {(
                  [
                    { value: '', label: 'Tutti' },
                    { value: 'admin', label: 'Admin' },
                    { value: 'user', label: 'User' },
                  ] as const
                ).map((pill) => {
                  const active = roleFilter === pill.value
                  return (
                    <button
                      key={pill.label}
                      type="button"
                      onClick={() => setRoleFilter(pill.value)}
                      className={cn(
                        'inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium transition-colors',
                        active
                          ? 'bg-foreground text-background shadow-xs sync-security:bg-[#ff9c00] sync-security:text-[#000c20]'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {pill.label}
                    </button>
                  )
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={refreshing}
                onClick={() => loadUsers(true)}
                className="h-10 gap-1.5 rounded-xl border-border/70 bg-card/50 px-3.5 text-xs"
              >
                <RefreshCw
                  className={cn('size-3.5', refreshing && 'animate-spin')}
                />
                <span className="hidden sm:inline">Aggiorna</span>
              </Button>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 px-5 pb-6 sm:px-6">
            {loading ? (
              <div className="space-y-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/40 px-4 py-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-28 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/20 px-6 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-400 sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]">
                  <Users className="size-6" />
                </div>
                <p className="mt-3 text-sm font-semibold">
                  Nessun utente trovato
                </p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Prova a modificare i termini di ricerca o il filtro per ruolo.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredUsers.map((u) => {
                  const isSelf = u.id === currentUser.id
                  const isBusy = busyUserId === u.id
                  const isAdmin = u.role === 'admin'

                  return (
                    <div
                      key={u.id}
                      className={cn(
                        'flex flex-col justify-between gap-4 rounded-xl border px-4 py-3.5 transition-colors sm:flex-row sm:items-center',
                        isSelf
                          ? 'border-violet-500/40 bg-violet-500/[0.04] sync-security:border-[#ff9c00]/40 sync-security:bg-[#ff9c00]/[0.05]'
                          : 'border-border/70 bg-card/45 hover:border-border hover:bg-card/75',
                      )}
                    >
                      {/* User Identity */}
                      <div className="flex min-w-0 items-center gap-3.5">
                        <Avatar className="size-10 shrink-0 border border-border/60">
                          <AvatarFallback className="bg-muted text-xs font-semibold">
                            {getInitials(u.name || u.email)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {u.name}
                            </p>
                            {isSelf && (
                              <Badge
                                variant="outline"
                                className="border-violet-500/40 bg-violet-500/10 px-1.5 py-0 text-[10px] text-violet-300 sync-security:border-[#ff9c00]/40 sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]"
                              >
                                Tu
                              </Badge>
                            )}
                            {isAdmin ? (
                              <Badge
                                variant="secondary"
                                className="gap-1 border-amber-500/30 bg-amber-500/15 px-2 py-0 text-[10px] font-semibold text-amber-300"
                              >
                                <ShieldCheck className="size-3" />
                                Admin
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="gap-1 px-2 py-0 text-[10px] text-muted-foreground"
                              >
                                <User className="size-3" />
                                User
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {u.email}
                          </p>
                        </div>
                      </div>

                      {/* Metadata & Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-4 sm:justify-end">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div
                            className="flex items-center gap-1.5"
                            title="Cartelle di proprietà e credenziali"
                          >
                            <Folder className="size-3.5 text-sky-400" />
                            <span>{u.vault_count} cartelle</span>
                            <span className="text-border">·</span>
                            <KeyRound className="size-3.5 text-violet-400 sync-security:text-[#ff9c00]" />
                            <span>{u.credential_count} credenziali</span>
                          </div>

                          <div
                            className="hidden items-center gap-1.5 lg:flex"
                            title={`Registrato il ${formatShortDate(u.created_at)}`}
                          >
                            <Calendar className="size-3.5" />
                            <span>{formatShortDate(u.created_at)}</span>
                          </div>

                          <div
                            className="hidden items-center gap-1.5 md:flex"
                            title="Ultimo accesso rilevato"
                          >
                            <Clock className="size-3.5 text-emerald-400" />
                            <span>{formatRelativeDate(u.last_seen_at)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Select
                            value={u.role}
                            disabled={isSelf || isBusy}
                            onValueChange={(val) =>
                              handleRoleChange(u, val as UserRole)
                            }
                          >
                            <SelectTrigger
                              className="h-8 w-28 rounded-lg text-xs"
                              title={
                                isSelf
                                  ? 'Non puoi modificare il tuo stesso ruolo'
                                  : 'Cambia ruolo utente'
                              }
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="user">User</SelectItem>
                            </SelectContent>
                          </Select>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={isSelf || isBusy}
                            onClick={() => setPendingDeleteUser(u)}
                            className="size-8 rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-40"
                            title={
                              isSelf
                                ? 'Non puoi eliminare il tuo stesso account'
                                : `Elimina utente ${u.name}`
                            }
                            aria-label={`Elimina utente ${u.name}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      ) : (
        /* Tab 2: Audit di sistema (Predisposto ma non implementato) */
        <ScrollArea className="min-h-0 flex-1 px-5 py-5 sm:px-6">
          <div className="space-y-5">
            {/* Predisposed Info Banner */}
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                  <ShieldAlert className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Audit di Sistema — Chi ha fatto cosa e quando
                    </h3>
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300"
                    >
                      Sezione predisposta
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Questa sezione è predisposta per il tracciamento globale
                    degli eventi di sicurezza e amministrazione a livello di
                    sistema (autenticazioni, cambi di ruolo RBAC, operazioni su
                    cartelle e accessi alle credenziali).
                  </p>
                </div>
              </div>
            </div>

            {/* Predisposed Filter Controls (Chi / Cosa / Quando) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-card/40 p-3.5 opacity-75">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <User className="size-3.5 text-violet-400 sync-security:text-[#ff9c00]" />
                  <span>CHI (Attore)</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Filtro per utente, email, ruolo RBAC (Admin / User) o
                  indirizzo IP sorgente.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card/40 p-3.5 opacity-75">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Activity className="size-3.5 text-sky-400" />
                  <span>COSA (Azione & Risorsa)</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Filtro per tipologia di evento (es. <code>auth.login</code>,{' '}
                  <code>rbac.role_changed</code>, <code>vault.shared</code>).
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-card/40 p-3.5 opacity-75">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Clock className="size-3.5 text-emerald-400" />
                  <span>QUANDO (Timestamp)</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Filtro per intervallo temporale, data e ora esatta
                  dell&apos;operazione.
                </p>
              </div>
            </div>

            {/* Predisposed Table Structure Preview */}
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/30">
              <div className="grid grid-cols-12 border-b border-border/70 bg-muted/40 px-4 py-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                <div className="col-span-4">Chi (Attore & Ruolo)</div>
                <div className="col-span-5">Cosa (Azione & Dettagli)</div>
                <div className="col-span-3 text-right">Quando (Data e Ora)</div>
              </div>

              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-400 sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]">
                  <FileClock className="size-6" />
                </div>
                <p className="mt-3 text-sm font-semibold">
                  Registro Audit di Sistema predisposto
                </p>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                  L&apos;architettura API (<code>GET /api/admin/audit</code>), i
                  modelli dati e l&apos;interfaccia per consultare{' '}
                  <strong className="text-foreground">
                    chi ha fatto cosa e quando
                  </strong>{' '}
                  sono predisposti e pronti per l&apos;attivazione della
                  raccolta eventi.
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
      )}

      {/* Delete User Confirmation Dialog */}
      <AlertDialog
        open={Boolean(pendingDeleteUser)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteUser(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo utente?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;utente{' '}
              <strong className="text-foreground">
                {pendingDeleteUser?.name} ({pendingDeleteUser?.email})
              </strong>{' '}
              e tutte le cartelle di sua proprietà verranno eliminati
              definitivamente dal sistema. Questa operazione non può essere
              annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmDeleteUser}
            >
              Elimina utente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
