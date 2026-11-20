import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  FileClock,
  Folder,
  KeyRound,
  MailPlus,
  Pencil,
  Plus,
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
import { GroupDialog } from '@/components/group-dialog'
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
  type Group,
  type GroupRole,
  type UserRole,
  type UserSummary,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  formatRelativeDate,
  formatShortDate,
  getInitials,
  getVaultColor,
} from '@/lib/vault-utils'

export type AdminPanelTab = 'users' | 'groups' | 'audit'

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
  const [adminGroups, setAdminGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [groupSearchQuery, setGroupSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'' | UserRole>('')
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [pendingDeleteUser, setPendingDeleteUser] =
    useState<AdminUser | null>(null)

  // Admin Groups management state
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<Group | null>(
    null,
  )
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [newMemberRole, setNewMemberRole] = useState<GroupRole>('member')
  const [busyGroupKey, setBusyGroupKey] = useState<string | null>(null)

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const [userList, groupList] = await Promise.all([
        vaultApi.listAdminUsers(),
        vaultApi.listAdminGroups(),
      ])
      setUsers(userList)
      setAdminGroups(groupList)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore nel caricamento dei dati di amministrazione',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const stats = useMemo(() => {
    const total = users.length
    const admins = users.filter((u) => u.role === 'admin').length
    const totalGroups = adminGroups.length
    const totalVaults = users.reduce((acc, u) => acc + u.vault_count, 0)
    return { total, admins, totalGroups, totalVaults }
  }, [users, adminGroups])

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

  const filteredGroups = useMemo(() => {
    const q = groupSearchQuery.trim().toLowerCase()
    if (!q) return adminGroups
    return adminGroups.filter((g) => {
      const memberText = g.members
        .map((m) => `${m.name ?? ''} ${m.email}`)
        .join(' ')
      const hay = `${g.name} ${g.description} ${memberText}`.toLowerCase()
      return hay.includes(q)
    })
  }, [adminGroups, groupSearchQuery])

  const handleAdminAddGroupMember = async (
    e: React.FormEvent,
    group: Group,
  ) => {
    e.preventDefault()
    const cleanEmail = newMemberEmail.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast.error('Inserisci un indirizzo email valido')
      return
    }
    setBusyGroupKey(`add:${group.id}`)
    try {
      const updated = await vaultApi.addGroupMember(group.id, {
        email: cleanEmail,
        role: newMemberRole,
      })
      setAdminGroups((prev) =>
        prev.map((g) => (g.id === updated.id ? updated : g)),
      )
      setNewMemberEmail('')
      toast.success(`${cleanEmail} aggiunto al gruppo "${group.name}"`)
      onUsersChanged?.()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore aggiunta membro',
      )
    } finally {
      setBusyGroupKey(null)
    }
  }

  const handleAdminGroupMemberRole = async (
    groupId: string,
    memberId: string,
    role: GroupRole,
  ) => {
    setBusyGroupKey(memberId)
    try {
      const updated = await vaultApi.updateGroupMemberRole(
        groupId,
        memberId,
        role,
      )
      setAdminGroups((prev) =>
        prev.map((g) => (g.id === updated.id ? updated : g)),
      )
      toast.success('Ruolo aggiornato')
      onUsersChanged?.()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore aggiornamento ruolo',
      )
    } finally {
      setBusyGroupKey(null)
    }
  }

  const handleAdminRemoveGroupMember = async (
    group: Group,
    memberId: string,
    email: string,
  ) => {
    setBusyGroupKey(memberId)
    try {
      await vaultApi.removeGroupMember(group.id, memberId)
      setAdminGroups((prev) =>
        prev.map((g) => {
          if (g.id !== group.id) return g
          const nextMembers = g.members.filter((m) => m.id !== memberId)
          return {
            ...g,
            members: nextMembers,
            member_count: nextMembers.length,
          }
        }),
      )
      toast.success(`${email} rimosso dal gruppo "${group.name}"`)
      onUsersChanged?.()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore rimozione membro',
      )
    } finally {
      setBusyGroupKey(null)
    }
  }

  const confirmDeleteGroup = async () => {
    if (!pendingDeleteGroup) return
    const target = pendingDeleteGroup
    setPendingDeleteGroup(null)
    setBusyGroupKey(`del:${target.id}`)
    try {
      await vaultApi.deleteGroup(target.id)
      setAdminGroups((prev) => prev.filter((g) => g.id !== target.id))
      if (expandedGroupId === target.id) setExpandedGroupId(null)
      toast.success(`Gruppo "${target.name}" eliminato`)
      onUsersChanged?.()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore eliminazione gruppo',
      )
    } finally {
      setBusyGroupKey(null)
    }
  }

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
              <User className="size-3.5" />
              <span>Lista utenti</span>
              <span className="rounded-full bg-background/60 px-1.5 py-0.2 text-[10px]">
                {users.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('groups')}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-medium transition-colors',
                activeTab === 'groups'
                  ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30 sync-security:bg-[#ff9c00]/20 sync-security:text-[#ff9c00] sync-security:ring-[#ff9c00]/40'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Users className="size-3.5" />
              <span>Gruppi</span>
              <span className="rounded-full bg-background/60 px-1.5 py-0.2 text-[10px]">
                {adminGroups.length}
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
              <User className="size-4.5" />
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
              <Users className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {stats.totalGroups}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Gruppi attivi
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
                onClick={() => loadData(true)}
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
      ) : activeTab === 'groups' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Groups Search & Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3 sm:px-6">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca gruppo per nome, descrizione o membro..."
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
                className="h-10 rounded-xl border-border/70 bg-card/50 pr-10 pl-10 text-sm"
              />
              {groupSearchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setGroupSearchQuery('')}
                  className="absolute top-1/2 right-2.5 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Cancella ricerca"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditingGroup(null)
                  setGroupDialogOpen(true)
                }}
                className="h-10 gap-1.5 rounded-xl px-3.5 text-xs"
              >
                <Plus className="size-4" />
                Nuovo gruppo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={refreshing}
                onClick={() => loadData(true)}
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
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/40 px-4 py-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-10 rounded-xl" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-28 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/20 px-6 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-400 sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]">
                  <Users className="size-6" />
                </div>
                <p className="mt-3 text-sm font-semibold">
                  Nessun gruppo trovato
                </p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  {groupSearchQuery
                    ? 'Prova a modificare i termini di ricerca.'
                    : 'Crea il primo gruppo per organizzare gli utenti e condividere cartelle in blocco.'}
                </p>
                {!groupSearchQuery && (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-4 gap-1.5 rounded-lg"
                    onClick={() => {
                      setEditingGroup(null)
                      setGroupDialogOpen(true)
                    }}
                  >
                    <Plus className="size-4" />
                    Crea gruppo
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredGroups.map((g) => {
                  const palette = getVaultColor(g.color)
                  const isExpanded = expandedGroupId === g.id
                  return (
                    <div
                      key={g.id}
                      className="overflow-hidden rounded-xl border border-border/70 bg-card/45"
                    >
                      <div className="flex flex-col justify-between gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 items-center gap-3.5">
                          <div
                            className={cn(
                              'flex size-10 shrink-0 items-center justify-center rounded-xl',
                              palette.bg,
                              palette.text,
                            )}
                          >
                            <Users className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {g.name}
                              </p>
                              <Badge
                                variant="secondary"
                                className="px-1.5 py-0 text-[10px]"
                              >
                                {g.member_count}{' '}
                                {g.member_count === 1 ? 'membro' : 'membri'}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="px-1.5 py-0 text-[10px]"
                              >
                                {g.vault_count}{' '}
                                {g.vault_count === 1 ? 'cartella' : 'cartelle'}
                              </Badge>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {g.description || `Creato da ${g.created_by_name}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 rounded-lg text-xs"
                            onClick={() => {
                              setExpandedGroupId(isExpanded ? null : g.id)
                              setNewMemberEmail('')
                              setNewMemberRole('member')
                            }}
                          >
                            <Users className="size-3.5" />
                            Membri
                            {isExpanded ? (
                              <ChevronUp className="size-3.5" />
                            ) : (
                              <ChevronDown className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditingGroup(g)
                              setGroupDialogOpen(true)
                            }}
                            title="Modifica gruppo"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={busyGroupKey === `del:${g.id}`}
                            className="size-8 rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                            onClick={() => setPendingDeleteGroup(g)}
                            title="Elimina gruppo"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="space-y-3 border-t border-border/60 bg-muted/20 px-4 py-3.5">
                          <form
                            onSubmit={(e) => handleAdminAddGroupMember(e, g)}
                            className="flex flex-wrap gap-2"
                          >
                            <Input
                              type="email"
                              placeholder="Aggiungi utente tramite email..."
                              value={newMemberEmail}
                              onChange={(e) =>
                                setNewMemberEmail(e.target.value)
                              }
                              className="h-9 min-w-[200px] flex-1 bg-background text-xs"
                            />
                            <Select
                              value={newMemberRole}
                              onValueChange={(v) =>
                                setNewMemberRole(v as GroupRole)
                              }
                            >
                              <SelectTrigger className="h-9 w-28 bg-background text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">Membro</SelectItem>
                                <SelectItem value="owner">Gestore</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={busyGroupKey === `add:${g.id}`}
                              className="h-9 gap-1.5 text-xs"
                            >
                              <MailPlus className="size-3.5" />
                              Aggiungi
                            </Button>
                          </form>

                          <div className="space-y-1.5">
                            {g.members.map((m) => (
                              <div
                                key={m.id}
                                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2"
                              >
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <Avatar className="size-7">
                                    <AvatarFallback className="text-[11px] font-semibold">
                                      {getInitials(m.name || m.email)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="truncate text-xs font-medium">
                                        {m.name || m.email}
                                      </p>
                                      {m.role === 'owner' && (
                                        <Crown className="size-3 text-amber-500" />
                                      )}
                                      {m.is_pending && (
                                        <Badge
                                          variant="outline"
                                          className="py-0 text-[9px]"
                                        >
                                          In attesa
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="truncate text-[11px] text-muted-foreground">
                                      {m.email}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-1.5">
                                  <Select
                                    value={m.role}
                                    disabled={busyGroupKey === m.id}
                                    onValueChange={(v) =>
                                      handleAdminGroupMemberRole(
                                        g.id,
                                        m.id,
                                        v as GroupRole,
                                      )
                                    }
                                  >
                                    <SelectTrigger className="h-7 w-24 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="owner">
                                        Gestore
                                      </SelectItem>
                                      <SelectItem value="member">
                                        Membro
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    disabled={busyGroupKey === m.id}
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() =>
                                      handleAdminRemoveGroupMember(
                                        g,
                                        m.id,
                                        m.email,
                                      )
                                    }
                                    title="Rimuovi dal gruppo"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      ) : (
        /* Tab 3: Audit di sistema (Predisposto ma non implementato) */
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

      {/* Create / Edit Group Dialog */}
      <GroupDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        editingGroup={editingGroup}
        onSaved={(saved) => {
          setAdminGroups((prev) => {
            const exists = prev.some((g) => g.id === saved.id)
            return exists
              ? prev.map((g) => (g.id === saved.id ? saved : g))
              : [...prev, saved].sort((a, b) =>
                  a.name.localeCompare(b.name, 'it'),
                )
          })
          onUsersChanged?.()
        }}
      />

      {/* Delete Group Confirmation Dialog */}
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
