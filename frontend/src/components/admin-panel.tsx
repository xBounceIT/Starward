import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bot,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  FileClock,
  FilterX,
  Folder,
  KeyRound,
  Lock,
  MailPlus,
  Pencil,
  Plus,
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
import { GroupDialog } from '@/components/group-dialog'
import { ServiceAccountsSection } from '@/components/service-accounts-section'
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
  type SystemAuditEvent,
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

export type AdminPanelTab = 'users' | 'groups' | 'service-accounts' | 'audit'
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
  'vault.group_shared': {
    label: 'Cartella condivisa con gruppo',
    tone: 'violet',
    icon: Share2,
  },
  'vault.group_updated': {
    label: 'Permessi gruppo modificati',
    tone: 'amber',
    icon: Users,
  },
  'vault.group_removed': {
    label: 'Accesso gruppo revocato',
    tone: 'rose',
    icon: Users,
  },
  'group.created': {
    label: 'Gruppo creato',
    tone: 'emerald',
    icon: Users,
  },
  'group.updated': {
    label: 'Gruppo aggiornato',
    tone: 'sky',
    icon: Users,
  },
  'group.deleted': {
    label: 'Gruppo eliminato',
    tone: 'rose',
    icon: Trash2,
  },
  'group.member_added': {
    label: 'Membro aggiunto al gruppo',
    tone: 'emerald',
    icon: Users,
  },
  'group.member_updated': {
    label: 'Ruolo membro gruppo modificato',
    tone: 'amber',
    icon: Users,
  },
  'group.member_removed': {
    label: 'Membro rimosso dal gruppo',
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
  'service_account.created': {
    label: 'Service Account creato',
    tone: 'emerald',
    icon: Bot,
  },
  'service_account.updated': {
    label: 'Service Account aggiornato',
    tone: 'sky',
    icon: Bot,
  },
  'service_account.deleted': {
    label: 'Service Account eliminato',
    tone: 'rose',
    icon: Trash2,
  },
  'service_account.key_created': {
    label: 'Chiave Service Account generata',
    tone: 'emerald',
    icon: KeyRound,
  },
  'service_account.key_revoked': {
    label: 'Chiave Service Account revocata',
    tone: 'rose',
    icon: Trash2,
  },
  'auth.service_account_key_used': {
    label: 'Accesso Service Account',
    tone: 'violet',
    icon: Bot,
  },
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  auth: 'Autenticazione',
  user: 'Utente & RBAC',
  group: 'Gruppo',
  vault: 'Cartella',
  credential: 'Credenziale',
  api_key: 'API Key',
  service_account: 'Service Account',
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
      return 'border-border bg-secondary text-secondary-foreground sync-security:border-[#ff9c00]/35 sync-security:bg-[#ff9c00]/12 sync-security:text-[#ff9c00]'
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
  const [adminGroups, setAdminGroups] = useState<Group[]>([])
  const [serviceAccountsCount, setServiceAccountsCount] = useState<number>(0)
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

  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const [userList, groupList, saList] = await Promise.all([
        vaultApi.listAdminUsers(),
        vaultApi.listAdminGroups(),
        vaultApi.listServiceAccounts().catch(() => null),
      ])
      setUsers(userList)
      setAdminGroups(groupList)
      if (saList) {
        setServiceAccountsCount(saList.length)
      }
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

  const handleServiceAccountsChanged = useCallback(
    (list: { id: string }[]) => {
      setServiceAccountsCount(list.length)
      loadAudit(true)
    },
    [loadAudit],
  )

  useEffect(() => {
    loadData()
    loadAudit()
  }, [loadData, loadAudit])

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
        if (auditTargetType === 'service_account')
          return (
            act.startsWith('service_account.') ||
            act === 'auth.service_account_key_used'
          )
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
      <div className="space-y-4 border-b border-border/70 px-5 pt-5 pb-4 sync-security:border-white/20 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <SidebarTrigger className="-ml-1 hidden shrink-0 md:inline-flex lg:hidden" />
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground sync-security:rounded-full sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b]">
                <ShieldCheck className="size-4.5" />
              </div>
              <h2 className="truncate text-xl font-bold tracking-tight sync-security:text-lg sync-security:tracking-normal">
                Pannello Admin
              </h2>
              <Badge
                variant="secondary"
                className="text-[11px] font-semibold sync-security:border-[#ff9c00]/40 sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]"
              >
                RBAC · Admin
              </Badge>
            </div>
            <p className="mt-1 truncate pl-10 text-xs text-muted-foreground">
              Gestione centralizzata degli utenti, Service Account di sistema
              con API Key granulari e audit.
            </p>
          </div>

          {/* Section Switcher Tabs */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-card/50 p-1 sync-security:rounded-lg sync-security:border-white/20 sync-security:bg-[#0e1b33]">
            <button
              type="button"
              onClick={() => onTabChange('users')}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-medium transition-colors sync-security:rounded-[5px]',
                activeTab === 'users'
                  ? 'bg-accent text-accent-foreground shadow-xs ring-1 ring-border sync-security:bg-[#ff9c00] sync-security:font-bold sync-security:text-[#1a2c4b] sync-security:ring-0'
                  : 'text-muted-foreground hover:text-foreground sync-security:hover:text-[#ff9c00]',
              )}
            >
              <User className="size-3.5" />
              <span>Lista utenti</span>
              <span className="rounded-full bg-background/60 px-1.5 py-0.2 text-[10px] sync-security:bg-[#1a2c4b]/20 sync-security:text-current">
                {users.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('groups')}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-medium transition-colors sync-security:rounded-[5px]',
                activeTab === 'groups'
                  ? 'bg-accent text-accent-foreground shadow-xs ring-1 ring-border sync-security:bg-[#ff9c00] sync-security:font-bold sync-security:text-[#1a2c4b] sync-security:ring-0'
                  : 'text-muted-foreground hover:text-foreground sync-security:hover:text-[#ff9c00]',
              )}
            >
              <Users className="size-3.5" />
              <span>Gruppi</span>
              <span className="rounded-full bg-background/60 px-1.5 py-0.2 text-[10px] sync-security:bg-[#1a2c4b]/20 sync-security:text-current">
                {adminGroups.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('service-accounts')}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-medium transition-colors sync-security:rounded-[5px]',
                activeTab === 'service-accounts'
                  ? 'bg-accent text-accent-foreground shadow-xs ring-1 ring-border sync-security:bg-[#ff9c00] sync-security:font-bold sync-security:text-[#1a2c4b] sync-security:ring-0'
                  : 'text-muted-foreground hover:text-foreground sync-security:hover:text-[#ff9c00]',
              )}
            >
              <Bot className="size-3.5" />
              <span>Service Account</span>
              <span className="rounded-full bg-background/60 px-1.5 py-0.2 text-[10px] sync-security:bg-[#1a2c4b]/20 sync-security:text-current">
                {serviceAccountsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('audit')}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-medium transition-colors sync-security:rounded-[5px]',
                activeTab === 'audit'
                  ? 'bg-accent text-accent-foreground shadow-xs ring-1 ring-border sync-security:bg-[#ff9c00] sync-security:font-bold sync-security:text-[#1a2c4b] sync-security:ring-0'
                  : 'text-muted-foreground hover:text-foreground sync-security:hover:text-[#ff9c00]',
              )}
            >
              <FileClock className="size-3.5" />
              <span>Audit di sistema</span>
              <span className="rounded-full bg-background/60 px-1.5 py-0.2 text-[10px] sync-security:bg-[#1a2c4b]/20 sync-security:text-current">
                {auditEvents.length}
              </span>
            </button>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3 sync-security:rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground sync-security:rounded-full sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b]">
              <User className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight sync-security:text-[#ff9c00]">
                {stats.total}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Utenti registrati
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3 sync-security:rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 sync-security:rounded-full sync-security:bg-[#ff9c00]/20 sync-security:text-[#ff9c00]">
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

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3 sync-security:rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 sync-security:rounded-full">
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

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3 sync-security:rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground sync-security:rounded-full sync-security:bg-[#ff9c00]/20 sync-security:text-[#ff9c00]">
              <Bot className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {serviceAccountsCount}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Service Account
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3 sync-security:rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 sync-security:rounded-full">
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
              <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-card/50 p-1 sync-security:rounded-lg sync-security:border-white/20 sync-security:bg-[#0e1b33]">
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
                        'inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium transition-colors sync-security:rounded-[5px]',
                        active
                          ? 'bg-foreground text-background shadow-xs sync-security:bg-[#ff9c00] sync-security:font-bold sync-security:text-[#1a2c4b]'
                          : 'text-muted-foreground hover:text-foreground sync-security:hover:text-[#ff9c00]',
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
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/20 px-6 py-16 text-center sync-security:rounded-lg sync-security:border-white/20 sync-security:bg-[#0e1b33]">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground sync-security:rounded-full sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b]">
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
                        'flex flex-col justify-between gap-4 rounded-xl border px-4 py-3.5 transition-colors sync-security:rounded-lg sm:flex-row sm:items-center',
                        isSelf
                          ? 'border-primary/40 bg-accent/50 sync-security:border-[#ff9c00]/70 sync-security:border-l-2 sync-security:bg-[#132442]'
                          : 'border-border/70 bg-card/45 hover:border-border hover:bg-card/75 sync-security:border-white/15 sync-security:bg-[#0e1b33] sync-security:hover:border-[#ff9c00]/50 sync-security:hover:bg-[#132442]',
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
                                variant="secondary"
                                className="px-1.5 py-0 text-[10px] sync-security:border-[#ff9c00]/40 sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]"
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
                            <KeyRound className="size-3.5 text-muted-foreground sync-security:text-[#ff9c00]" />
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
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]">
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
      ) : activeTab === 'service-accounts' ? (
        <ServiceAccountsSection
          onAccountsChanged={handleServiceAccountsChanged}
        />
      ) : (
        /* Tab 4: Audit di sistema (Chi ha fatto cosa e quando) */
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Top Search & Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3 sm:px-6">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca evento per utente, email, codice azione o dettagli..."
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                className="h-10 rounded-xl border-border/70 bg-card/50 pr-10 pl-10 text-sm sync-security:rounded-lg sync-security:border-white/20 sync-security:bg-[#0e1b33]"
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
                  className="h-10 gap-1.5 rounded-xl px-3 text-xs text-muted-foreground hover:text-foreground sync-security:rounded-lg"
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
                className="h-10 gap-1.5 rounded-xl border-border/70 bg-card/50 px-3.5 text-xs sync-security:rounded-lg"
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
                <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/70 bg-card/45 p-3.5 sync-security:rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <User className="size-3.5 text-foreground sync-security:text-[#ff9c00]" />
                      <span>CHI (Attore & Ruolo)</span>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 p-0.5 sync-security:border-white/15 sync-security:bg-[#000c20]">
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
                              'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors sync-security:rounded-[4px]',
                              active
                                ? 'bg-foreground text-background sync-security:bg-[#ff9c00] sync-security:font-bold sync-security:text-[#1a2c4b]'
                                : 'text-muted-foreground hover:text-foreground sync-security:hover:text-[#ff9c00]',
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
                <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/70 bg-card/45 p-3.5 sync-security:rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
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
                        <SelectItem value="service_account">
                          Service Account
                        </SelectItem>
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
                <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/70 bg-card/45 p-3.5 sync-security:rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
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

                  <div className="grid grid-cols-4 gap-1 rounded-lg border border-border/60 bg-background/50 p-1 sync-security:border-white/15 sync-security:bg-[#000c20]">
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
                            'inline-flex h-6 items-center justify-center rounded-md px-2 text-[11px] font-medium transition-colors sync-security:rounded-[4px]',
                            active
                              ? 'bg-foreground text-background shadow-2xs sync-security:bg-[#ff9c00] sync-security:font-bold sync-security:text-[#1a2c4b]'
                              : 'text-muted-foreground hover:text-foreground sync-security:hover:text-[#ff9c00]',
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
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/30 sync-security:rounded-lg sync-security:border-white/15 sync-security:bg-[#0e1b33]">
                <div className="hidden grid-cols-12 border-b border-border/70 bg-muted/40 px-4 py-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase sync-security:border-white/15 sync-security:bg-[#1a2c4b]/60 sync-security:tracking-[0.14em] sync-security:text-[#ff9c00] md:grid">
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
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground sync-security:rounded-full sync-security:bg-[#ff9c00] sync-security:text-[#1a2c4b]">
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
                                    variant="secondary"
                                    className="px-1.5 py-0 text-[10px] sync-security:border-[#ff9c00]/40 sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]"
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
