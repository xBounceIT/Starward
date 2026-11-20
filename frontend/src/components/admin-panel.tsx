import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Calendar,
  Clock,
  FileClock,
  FilterX,
  Folder,
  KeyRound,
  Lock,
  RefreshCw,
  Search,
  Settings,
  Share2,
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
  type SystemAuditEvent,
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
type AuditPeriodFilter = 'all' | '24h' | '7d' | '30d'

interface AuditActionMeta {
  label: string
  tone: 'emerald' | 'sky' | 'amber' | 'rose' | 'violet'
  icon: typeof Activity
}

const AUDIT_ACTION_META: Record<string, AuditActionMeta> = {
  'auth.login': {
    label: 'Accesso utente',
    tone: 'emerald',
    icon: Lock,
  },
  'auth.api_key_used': {
    label: 'Accesso API Key',
    tone: 'violet',
    icon: KeyRound,
  },
  'rbac.role_changed': {
    label: 'Cambio ruolo RBAC',
    tone: 'amber',
    icon: ShieldCheck,
  },
  'user.deleted': {
    label: 'Utente eliminato',
    tone: 'rose',
    icon: Trash2,
  },
  'user.profile_updated': {
    label: 'Profilo aggiornato',
    tone: 'sky',
    icon: User,
  },
  'user.settings_updated': {
    label: 'Impostazioni modificate',
    tone: 'sky',
    icon: Settings,
  },
  'api_key.created': {
    label: 'API Key generata',
    tone: 'emerald',
    icon: KeyRound,
  },
  'api_key.revoked': {
    label: 'API Key revocata',
    tone: 'rose',
    icon: Trash2,
  },
  'vault.created': {
    label: 'Cartella creata',
    tone: 'emerald',
    icon: Folder,
  },
  'vault.updated': {
    label: 'Cartella aggiornata',
    tone: 'sky',
    icon: Folder,
  },
  'vault.deleted': {
    label: 'Cartella eliminata',
    tone: 'rose',
    icon: Trash2,
  },
  'vault.shared': {
    label: 'Cartella condivisa',
    tone: 'violet',
    icon: Share2,
  },
  'vault.member_updated': {
    label: 'Permessi membro modificati',
    tone: 'amber',
    icon: Users,
  },
  'vault.member_removed': {
    label: 'Accesso membro revocato',
    tone: 'rose',
    icon: Users,
  },
  'credential.created': {
    label: 'Credenziale creata',
    tone: 'emerald',
    icon: KeyRound,
  },
  'credential.updated': {
    label: 'Credenziale aggiornata',
    tone: 'sky',
    icon: KeyRound,
  },
  'credential.deleted': {
    label: 'Credenziale eliminata',
    tone: 'rose',
    icon: Trash2,
  },
  'credential.accessed': {
    label: 'Credenziale consultata',
    tone: 'violet',
    icon: KeyRound,
  },
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  auth: 'Autenticazione',
  user: 'Utente & RBAC',
  vault: 'Cartella',
  credential: 'Credenziale',
  api_key: 'API Key',
}

function getAuditActionMeta(action: string): AuditActionMeta {
  if (AUDIT_ACTION_META[action]) {
    return AUDIT_ACTION_META[action]
  }
  if (action.endsWith('.deleted') || action.endsWith('.revoked') || action.endsWith('.removed')) {
    return { label: action, tone: 'rose', icon: Trash2 }
  }
  if (action.endsWith('.created') || action.endsWith('.login')) {
    return { label: action, tone: 'emerald', icon: Activity }
  }
  return { label: action, tone: 'sky', icon: Activity }
}

function getToneBadgeClasses(tone: AuditActionMeta['tone']): string {
  switch (tone) {
    case 'emerald':
      return 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300'
    case 'amber':
      return 'border-amber-500/35 bg-amber-500/12 text-amber-300'
    case 'rose':
      return 'border-rose-500/35 bg-rose-500/12 text-rose-300'
    case 'violet':
      return 'border-violet-500/35 bg-violet-500/12 text-violet-300 sync-security:border-[#ff9c00]/35 sync-security:bg-[#ff9c00]/12 sync-security:text-[#ff9c00]'
    case 'sky':
    default:
      return 'border-sky-500/35 bg-sky-500/12 text-sky-300'
  }
}

function formatExactAuditDateTime(iso: string): string {
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .format(date)
      .replace('.', '')
  } catch {
    return iso
  }
}

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

  // System Audit state ("Chi ha fatto cosa e quando")
  const [auditEvents, setAuditEvents] = useState<SystemAuditEvent[]>([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [auditRefreshing, setAuditRefreshing] = useState(false)
  const [auditSearchQuery, setAuditSearchQuery] = useState('')
  const [auditActorId, setAuditActorId] = useState<string>('all')
  const [auditActorRole, setAuditActorRole] = useState<'' | UserRole>('')
  const [auditTargetType, setAuditTargetType] = useState<string>('all')
  const [auditAction, setAuditAction] = useState<string>('all')
  const [auditPeriod, setAuditPeriod] = useState<AuditPeriodFilter>('all')

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

  const loadAudit = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setAuditRefreshing(true)
    } else {
      setAuditLoading(true)
    }
    try {
      const events = await vaultApi.listSystemAudit({ limit: 300 })
      setAuditEvents(events)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore nel caricamento del registro Audit di Sistema',
      )
    } finally {
      setAuditLoading(false)
      setAuditRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
    loadAudit()
  }, [loadUsers, loadAudit])

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
      loadAudit(true)
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
      loadAudit(true)
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

  const availableActors = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; email: string; role: UserRole }
    >()
    for (const u of users) {
      map.set(u.id, {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      })
    }
    for (const ev of auditEvents) {
      if (!map.has(ev.actor_id)) {
        map.set(ev.actor_id, {
          id: ev.actor_id,
          name: ev.actor_name,
          email: ev.actor_email,
          role: ev.actor_role,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'it'),
    )
  }, [users, auditEvents])

  const availableActions = useMemo(() => {
    const set = new Set<string>(Object.keys(AUDIT_ACTION_META))
    for (const ev of auditEvents) {
      set.add(ev.action)
    }
    return Array.from(set)
      .filter((act) => {
        if (auditTargetType === 'all') return true
        if (auditTargetType === 'auth') return act.startsWith('auth.')
        if (auditTargetType === 'user')
          return act.startsWith('user.') || act.startsWith('rbac.')
        if (auditTargetType === 'vault') return act.startsWith('vault.')
        if (auditTargetType === 'credential')
          return act.startsWith('credential.')
        if (auditTargetType === 'api_key')
          return act.startsWith('api_key.') || act === 'auth.api_key_used'
        return true
      })
      .sort()
  }, [auditEvents, auditTargetType])

  const hasActiveAuditFilters = Boolean(
    auditSearchQuery.trim() ||
      auditActorId !== 'all' ||
      auditActorRole !== '' ||
      auditTargetType !== 'all' ||
      auditAction !== 'all' ||
      auditPeriod !== 'all',
  )

  const resetAuditFilters = () => {
    setAuditSearchQuery('')
    setAuditActorId('all')
    setAuditActorRole('')
    setAuditTargetType('all')
    setAuditAction('all')
    setAuditPeriod('all')
  }

  const filteredAuditEvents = useMemo(() => {
    const q = auditSearchQuery.trim().toLowerCase()
    const nowMs = Date.now()
    const cutoffMs =
      auditPeriod === '24h'
        ? nowMs - 24 * 3600 * 1000
        : auditPeriod === '7d'
          ? nowMs - 7 * 24 * 3600 * 1000
          : auditPeriod === '30d'
            ? nowMs - 30 * 24 * 3600 * 1000
            : null

    return auditEvents.filter((ev) => {
      if (auditActorId !== 'all' && ev.actor_id !== auditActorId) return false
      if (auditActorRole && ev.actor_role !== auditActorRole) return false
      if (auditTargetType !== 'all' && ev.target_type !== auditTargetType)
        return false
      if (auditAction !== 'all' && ev.action !== auditAction) return false
      if (cutoffMs !== null) {
        const ts = new Date(ev.created_at).getTime()
        if (!Number.isNaN(ts) && ts < cutoffMs) return false
      }
      if (q) {
        const meta = getAuditActionMeta(ev.action)
        const targetLabel = TARGET_TYPE_LABELS[ev.target_type] ?? ev.target_type
        const hay =
          `${ev.actor_name} ${ev.actor_email} ${ev.actor_role} ${ev.action} ${meta.label} ${targetLabel} ${ev.details}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [
    auditEvents,
    auditSearchQuery,
    auditActorId,
    auditActorRole,
    auditTargetType,
    auditAction,
    auditPeriod,
  ])

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
              <span className="rounded-full bg-background/60 px-1.5 py-0.2 text-[10px]">
                {auditEvents.length}
              </span>
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
        /* Tab 2: Audit di sistema (Chi ha fatto cosa e quando) */
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Top Search & Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3 sm:px-6">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca evento per utente, email, codice azione o dettagli..."
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                className="h-10 rounded-xl border-border/70 bg-card/50 pr-10 pl-10 text-sm"
              />
              {auditSearchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setAuditSearchQuery('')}
                  className="absolute top-1/2 right-2.5 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Cancella ricerca audit"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {hasActiveAuditFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetAuditFilters}
                  className="h-10 gap-1.5 rounded-xl px-3 text-xs text-muted-foreground hover:text-foreground"
                >
                  <FilterX className="size-3.5" />
                  <span>Reset filtri</span>
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={auditRefreshing}
                onClick={() => loadAudit(true)}
                className="h-10 gap-1.5 rounded-xl border-border/70 bg-card/50 px-3.5 text-xs"
              >
                <RefreshCw
                  className={cn('size-3.5', auditRefreshing && 'animate-spin')}
                />
                <span className="hidden sm:inline">Aggiorna</span>
              </Button>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 px-5 pb-6 sm:px-6">
            <div className="space-y-4">
              {/* Interactive Filter Controls (Chi / Cosa / Quando) */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {/* 1. CHI (Attore & Ruolo) */}
                <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/70 bg-card/45 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <User className="size-3.5 text-violet-400 sync-security:text-[#ff9c00]" />
                      <span>CHI (Attore & Ruolo)</span>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 p-0.5">
                      {(
                        [
                          { value: '', label: 'Tutti' },
                          { value: 'admin', label: 'Admin' },
                          { value: 'user', label: 'User' },
                        ] as const
                      ).map((pill) => {
                        const active = auditActorRole === pill.value
                        return (
                          <button
                            key={pill.label}
                            type="button"
                            onClick={() => setAuditActorRole(pill.value)}
                            className={cn(
                              'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                              active
                                ? 'bg-foreground text-background sync-security:bg-[#ff9c00] sync-security:text-[#000c20]'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {pill.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <Select
                    value={auditActorId}
                    onValueChange={(val) => setAuditActorId(val)}
                  >
                    <SelectTrigger className="h-8 w-full rounded-lg bg-background/60 text-xs">
                      <SelectValue placeholder="Tutti gli utenti" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti gli utenti</SelectItem>
                      {availableActors.map((actor) => (
                        <SelectItem key={actor.id} value={actor.id}>
                          {actor.name} ({actor.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 2. COSA (Azione & Risorsa) */}
                <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/70 bg-card/45 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <Activity className="size-3.5 text-sky-400" />
                      <span>COSA (Azione & Risorsa)</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {auditTargetType === 'all'
                        ? 'Tutte le categorie'
                        : TARGET_TYPE_LABELS[auditTargetType] ?? auditTargetType}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={auditTargetType}
                      onValueChange={(val) => {
                        setAuditTargetType(val)
                        setAuditAction('all')
                      }}
                    >
                      <SelectTrigger className="h-8 w-full rounded-lg bg-background/60 text-xs">
                        <SelectValue placeholder="Risorsa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutte le risorse</SelectItem>
                        <SelectItem value="auth">Autenticazione</SelectItem>
                        <SelectItem value="user">Utenti & RBAC</SelectItem>
                        <SelectItem value="vault">Cartelle</SelectItem>
                        <SelectItem value="credential">Credenziali</SelectItem>
                        <SelectItem value="api_key">API Key</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={auditAction}
                      onValueChange={(val) => setAuditAction(val)}
                    >
                      <SelectTrigger className="h-8 w-full rounded-lg bg-background/60 text-xs">
                        <SelectValue placeholder="Azione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutte le azioni</SelectItem>
                        {availableActions.map((act) => {
                          const meta = getAuditActionMeta(act)
                          return (
                            <SelectItem key={act} value={act}>
                              {meta.label} ({act})
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 3. QUANDO (Timestamp) */}
                <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/70 bg-card/45 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <Clock className="size-3.5 text-emerald-400" />
                      <span>QUANDO (Intervallo)</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {filteredAuditEvents.length} di {auditEvents.length}{' '}
                      eventi
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1 rounded-lg border border-border/60 bg-background/50 p-1">
                    {(
                      [
                        { value: 'all', label: 'Tutto' },
                        { value: '24h', label: '24 ore' },
                        { value: '7d', label: '7 giorni' },
                        { value: '30d', label: '30 giorni' },
                      ] as const
                    ).map((period) => {
                      const active = auditPeriod === period.value
                      return (
                        <button
                          key={period.value}
                          type="button"
                          onClick={() => setAuditPeriod(period.value)}
                          className={cn(
                            'inline-flex h-6 items-center justify-center rounded-md px-2 text-[11px] font-medium transition-colors',
                            active
                              ? 'bg-foreground text-background shadow-2xs sync-security:bg-[#ff9c00] sync-security:text-[#000c20]'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {period.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* System Audit Events Table */}
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/30">
                <div className="hidden grid-cols-12 border-b border-border/70 bg-muted/40 px-4 py-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase md:grid">
                  <div className="col-span-4">Chi (Attore & Ruolo)</div>
                  <div className="col-span-5">Cosa (Azione & Dettagli)</div>
                  <div className="col-span-3 text-right">
                    Quando (Data e Ora)
                  </div>
                </div>

                {auditLoading ? (
                  <div className="divide-y divide-border/50">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="grid grid-cols-1 gap-3 px-4 py-3.5 md:grid-cols-12 md:items-center"
                      >
                        <div className="flex items-center gap-3 md:col-span-4">
                          <Skeleton className="size-9 rounded-full" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-3.5 w-32" />
                            <Skeleton className="h-3 w-44" />
                          </div>
                        </div>
                        <div className="space-y-1.5 md:col-span-5">
                          <Skeleton className="h-4 w-40 rounded-md" />
                          <Skeleton className="h-3 w-64" />
                        </div>
                        <div className="flex flex-col items-start gap-1.5 md:col-span-3 md:items-end">
                          <Skeleton className="h-3.5 w-20" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredAuditEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-400 sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]">
                      <FileClock className="size-6" />
                    </div>
                    <p className="mt-3 text-sm font-semibold">
                      {hasActiveAuditFilters
                        ? 'Nessun evento trovato con i filtri selezionati'
                        : 'Nessun evento di audit registrato'}
                    </p>
                    <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                      {hasActiveAuditFilters
                        ? 'Prova a modificare o reimpostare i filtri Chi / Cosa / Quando per visualizzare gli eventi.'
                        : 'Tutte le operazioni di autenticazione, modifica ruoli RBAC, gestione cartelle, credenziali e API Key appariranno qui in tempo reale.'}
                    </p>
                    {hasActiveAuditFilters && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={resetAuditFilters}
                        className="mt-4 h-8 gap-1.5 rounded-lg text-xs"
                      >
                        <FilterX className="size-3.5" />
                        Reimposta filtri
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {filteredAuditEvents.map((event) => {
                      const isSelf = event.actor_id === currentUser.id
                      const isAdmin = event.actor_role === 'admin'
                      const actionMeta = getAuditActionMeta(event.action)
                      const ActionIcon = actionMeta.icon
                      const targetLabel =
                        TARGET_TYPE_LABELS[event.target_type] ??
                        event.target_type

                      return (
                        <div
                          key={event.id}
                          className="grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-card/60 md:grid-cols-12 md:items-center"
                        >
                          {/* Col 1: CHI (Attore & Ruolo) */}
                          <div className="flex min-w-0 items-center gap-3 md:col-span-4">
                            <Avatar className="size-9 shrink-0 border border-border/60">
                              <AvatarFallback className="bg-muted text-xs font-semibold">
                                {getInitials(
                                  event.actor_name || event.actor_email,
                                )}
                              </AvatarFallback>
                            </Avatar>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-semibold text-foreground">
                                  {event.actor_name}
                                </span>
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
                                    className="gap-1 border-amber-500/30 bg-amber-500/15 px-1.5 py-0 text-[10px] font-semibold text-amber-300"
                                  >
                                    <ShieldCheck className="size-2.5" />
                                    Admin
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="gap-1 px-1.5 py-0 text-[10px] text-muted-foreground"
                                  >
                                    <User className="size-2.5" />
                                    User
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {event.actor_email}
                              </p>
                            </div>
                          </div>

                          {/* Col 2: COSA (Azione & Dettagli) */}
                          <div className="min-w-0 space-y-1 md:col-span-5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'gap-1 px-2 py-0.5 text-[11px] font-medium',
                                  getToneBadgeClasses(actionMeta.tone),
                                )}
                              >
                                <ActionIcon className="size-3" />
                                <span>{actionMeta.label}</span>
                              </Badge>

                              <Badge
                                variant="outline"
                                className="border-border/70 bg-background/50 px-1.5 py-0 text-[10px] text-muted-foreground"
                              >
                                {targetLabel}
                              </Badge>

                              <code className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {event.action}
                              </code>
                            </div>

                            <p className="text-xs leading-relaxed text-foreground/90">
                              {event.details}
                            </p>
                          </div>

                          {/* Col 3: QUANDO (Data e Ora) */}
                          <div className="flex flex-row items-center justify-between gap-2 text-xs md:col-span-3 md:flex-col md:items-end md:justify-center md:gap-0.5">
                            <div className="inline-flex items-center gap-1.5 font-medium text-foreground">
                              <Clock className="size-3.5 text-emerald-400" />
                              <span>
                                {formatRelativeDate(event.created_at)}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {formatExactAuditDateTime(event.created_at)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>
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
