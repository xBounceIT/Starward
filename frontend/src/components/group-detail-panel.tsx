import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  Crown,
  Folder,
  FolderPlus,
  KeyRound,
  LogOut,
  Pencil,
  Share2,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { VaultIcon } from '@/components/vault-icon'
import {
  vaultApi,
  type Group,
  type GroupRole,
  type UserSummary,
  type Vault,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { getInitials, getVaultColor } from '@/lib/vault-utils'

interface GroupDetailPanelProps {
  group: Group
  vaults: Vault[]
  currentUserId: string
  onGroupUpdated: (group: Group) => void
  onLeftGroup: (groupId: string) => void
  onEditGroup: (group: Group) => void
  onDeleteGroup: (group: Group) => void
  onNewGroupVault: (group: Group) => void
  onSelectVault: (vaultId: string) => void
  onDataChanged: () => void
}

export function GroupDetailPanel({
  group,
  vaults,
  currentUserId,
  onGroupUpdated,
  onLeftGroup,
  onEditGroup,
  onDeleteGroup,
  onNewGroupVault,
  onSelectVault,
  onDataChanged,
}: GroupDetailPanelProps) {
  const [memberSearch, setMemberSearch] = useState('')
  const [role, setRole] = useState<GroupRole>('member')
  const [suggestions, setSuggestions] = useState<UserSummary[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null)

  const palette = getVaultColor(group.color)
  const canManage = group.can_manage

  const ownedVaults = useMemo(
    () => vaults.filter((v) => v.owner_group_id === group.id),
    [vaults, group.id],
  )

  const sharedVaults = useMemo(
    () =>
      vaults.filter(
        (v) =>
          v.owner_group_id !== group.id &&
          v.shared_groups.some((sg) => sg.group_id === group.id),
      ),
    [vaults, group.id],
  )

  const totalCredentials = useMemo(() => {
    const uniqueVaults = new Map<string, Vault>()
    for (const v of ownedVaults) uniqueVaults.set(v.id, v)
    for (const v of sharedVaults) uniqueVaults.set(v.id, v)
    let count = 0
    for (const v of uniqueVaults.values()) count += v.credential_count
    return count
  }, [ownedVaults, sharedVaults])

  const selfMember = useMemo(
    () => group.members.find((m) => m.user_id === currentUserId) ?? null,
    [group.members, currentUserId],
  )

  useEffect(() => {
    if (!canManage) return
    let active = true
    const timer = setTimeout(async () => {
      try {
        const users = await vaultApi.searchUsers(memberSearch)
        if (!active) return
        const memberKeys = new Set(
          group.members.map((m) => m.user_id ?? m.email.toLowerCase()),
        )
        setSuggestions(
          users.filter(
            (u) =>
              !memberKeys.has(u.id) && !memberKeys.has(u.email.toLowerCase()),
          ),
        )
      } catch {
        // ignore autocomplete errors
      }
    }, 150)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [memberSearch, canManage, group.members])

  const handleAddMember = async (user: UserSummary) => {
    setSubmitting(true)
    try {
      const updated = await vaultApi.addGroupMember(group.id, {
        user_id: user.id,
        role,
      })
      onGroupUpdated(updated)
      setMemberSearch('')
      toast.success(`${user.name} aggiunto al gruppo "${group.name}"`)
      onDataChanged()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore aggiunta membro al gruppo',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleRoleChange = async (memberId: string, newRole: GroupRole) => {
    setBusyMemberId(memberId)
    try {
      const updated = await vaultApi.updateGroupMemberRole(
        group.id,
        memberId,
        newRole,
      )
      onGroupUpdated(updated)
      toast.success('Ruolo aggiornato')
      onDataChanged()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore aggiornamento ruolo',
      )
    } finally {
      setBusyMemberId(null)
    }
  }

  const handleRemoveMember = async (
    memberId: string,
    memberEmail: string,
    isSelf: boolean,
  ) => {
    setBusyMemberId(memberId)
    try {
      await vaultApi.removeGroupMember(group.id, memberId)
      if (isSelf) {
        toast.success(`Hai lasciato il gruppo "${group.name}"`)
        onLeftGroup(group.id)
      } else {
        const nextMembers = group.members.filter((m) => m.id !== memberId)
        onGroupUpdated({
          ...group,
          members: nextMembers,
          member_count: nextMembers.length,
        })
        toast.success(`${memberEmail} rimosso dal gruppo`)
        onDataChanged()
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore rimozione membro',
      )
    } finally {
      setBusyMemberId(null)
    }
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      {/* Header */}
      <div className="space-y-4 border-b border-border/70 px-5 pt-5 pb-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <SidebarTrigger className="-ml-1 hidden shrink-0 md:inline-flex lg:hidden" />
              <div
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-xl',
                  palette.bg,
                  palette.text,
                )}
              >
                <Users className="size-4.5" />
              </div>
              <h2 className="truncate text-xl font-bold tracking-tight">
                {group.name}
              </h2>
              {group.my_role === 'owner' ? (
                <Badge
                  variant="secondary"
                  className="gap-1 text-[11px] font-semibold"
                >
                  <Crown className="size-3 text-amber-500" />
                  Gestore
                </Badge>
              ) : group.my_role === 'member' ? (
                <Badge variant="outline" className="text-[11px]">
                  Membro
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 truncate pl-11.5 text-xs text-muted-foreground">
              {group.description ||
                'Gruppo di utenti per la condivisione automatica di cartelle e credenziali.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {group.my_role && (
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5 rounded-lg text-xs"
                onClick={() => onNewGroupVault(group)}
              >
                <FolderPlus className="size-3.5" />
                Nuova cartella del gruppo
              </Button>
            )}
            {canManage && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 rounded-lg text-xs"
                  onClick={() => onEditGroup(group)}
                >
                  <Pencil className="size-3.5" />
                  Modifica
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-9 rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  onClick={() => onDeleteGroup(group)}
                  title="Elimina gruppo"
                  aria-label="Elimina gruppo"
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
            {!canManage && selfMember && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyMemberId === selfMember.id}
                className="h-9 gap-1.5 rounded-lg text-xs text-destructive hover:text-destructive"
                onClick={() =>
                  handleRemoveMember(selfMember.id, selfMember.email, true)
                }
              >
                <LogOut className="size-3.5" />
                Lascia gruppo
              </Button>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]">
              <Users className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {group.member_count}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Membri nel gruppo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Folder className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {ownedVaults.length}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Cartelle del gruppo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
              <Share2 className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {sharedVaults.length}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Cartelle condivise
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card/50 px-4 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <KeyRound className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tracking-tight">
                {totalCredentials}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                Credenziali accessibili
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Body */}
      <ScrollArea className="min-h-0 flex-1 px-5 py-5 sm:px-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Left Column: Folders associated with the group */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Cartelle del gruppo</h3>
                <p className="text-xs text-muted-foreground">
                  Cartelle create a nome del gruppo o condivise con questo
                  gruppo.
                </p>
              </div>
              {group.my_role && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="gap-1 rounded-lg"
                  onClick={() => onNewGroupVault(group)}
                >
                  <FolderPlus className="size-3.5" />
                  Nuova cartella
                </Button>
              )}
            </div>

            {ownedVaults.length === 0 && sharedVaults.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/20 px-6 py-10 text-center">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-muted text-foreground sync-security:bg-[#ff9c00]/15 sync-security:text-[#ff9c00]">
                  <Folder className="size-5" />
                </div>
                <p className="mt-3 text-sm font-semibold">
                  Nessuna cartella associata
                </p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Crea una cartella a nome di "{group.name}" oppure condividi
                  una cartella esistente con questo gruppo.
                </p>
                {group.my_role && (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-4 gap-1.5 rounded-lg"
                    onClick={() => onNewGroupVault(group)}
                  >
                    <FolderPlus className="size-4" />
                    Crea cartella per {group.name}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {ownedVaults.map((vault) => {
                  const vp = getVaultColor(vault.color)
                  const groupShare = vault.shared_groups.find(
                    (sg) => sg.group_id === group.id,
                  )
                  return (
                    <button
                      key={vault.id}
                      type="button"
                      onClick={() => onSelectVault(vault.id)}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/45 px-4 py-3 text-left transition-colors hover:border-border hover:bg-card/80"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-xl',
                            vp.bg,
                            vp.text,
                          )}
                        >
                          <VaultIcon icon={vault.icon} className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold">
                              {vault.name}
                            </p>
                            <Badge
                              variant="secondary"
                              className="px-1.5 py-0 text-[10px]"
                            >
                              Del gruppo
                            </Badge>
                            {groupShare && (
                              <Badge
                                variant="outline"
                                className="px-1.5 py-0 text-[10px]"
                              >
                                {groupShare.role === 'editor'
                                  ? 'Editor'
                                  : 'Sola lettura'}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {vault.description ||
                              `${vault.credential_count} ${vault.credential_count === 1 ? 'credenziale' : 'credenziali'}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        <span>{vault.credential_count}</span>
                        <ChevronRight className="size-4" />
                      </div>
                    </button>
                  )
                })}

                {sharedVaults.map((vault) => {
                  const vp = getVaultColor(vault.color)
                  const groupShare = vault.shared_groups.find(
                    (sg) => sg.group_id === group.id,
                  )
                  return (
                    <button
                      key={vault.id}
                      type="button"
                      onClick={() => onSelectVault(vault.id)}
                      className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/45 px-4 py-3 text-left transition-colors hover:border-border hover:bg-card/80"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-xl',
                            vp.bg,
                            vp.text,
                          )}
                        >
                          <VaultIcon icon={vault.icon} className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold">
                              {vault.name}
                            </p>
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[10px]"
                            >
                              Condivisa ·{' '}
                              {groupShare?.role === 'editor'
                                ? 'Editor'
                                : 'Sola lettura'}
                            </Badge>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            Proprietario: {vault.owner_name}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        <span>{vault.credential_count}</span>
                        <ChevronRight className="size-4" />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right Column: Group Members Management */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">
                Membri del gruppo ({group.members.length})
              </h3>
              <p className="text-xs text-muted-foreground">
                Ogni membro riceve automaticamente accesso a tutte le cartelle
                del gruppo e condivise con il gruppo.
              </p>
            </div>

            {canManage && (
              <div className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="group-member-search" className="text-xs">
                    Aggiungi membro dalla piattaforma
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="group-member-search"
                      type="text"
                      placeholder="Cerca utente per nome o email..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (suggestions.length > 0) {
                            handleAddMember(suggestions[0])
                          }
                        }
                      }}
                      className="min-w-[160px] flex-1"
                    />
                    <Select
                      value={role}
                      onValueChange={(v) => setRole(v as GroupRole)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Membro</SelectItem>
                        <SelectItem value="owner">Gestore</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {suggestions.length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-2">
                    <p className="mb-1.5 px-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                      Utenti della piattaforma
                    </p>
                    <div className="flex flex-col gap-1">
                      {suggestions.slice(0, 8).map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          disabled={submitting}
                          onClick={() => handleAddMember(u)}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                        >
                          <UserCheck className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">{u.name}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {u.email}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {group.members.map((member) => {
                const isSelf = member.user_id === currentUserId
                const isBusy = busyMemberId === member.id
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/45 px-3.5 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="text-xs font-semibold">
                          {getInitials(member.name || member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium">
                            {member.name || member.email}
                            {isSelf && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (tu)
                              </span>
                            )}
                          </p>
                          {member.is_pending && (
                            <Badge
                              variant="outline"
                              className="py-0 text-[10px]"
                            >
                              In attesa
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {canManage ? (
                        <>
                          <Select
                            value={member.role}
                            disabled={isBusy}
                            onValueChange={(v) =>
                              handleRoleChange(member.id, v as GroupRole)
                            }
                          >
                            <SelectTrigger className="h-8 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="owner">Gestore</SelectItem>
                              <SelectItem value="member">Membro</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={isBusy}
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              handleRemoveMember(
                                member.id,
                                member.email,
                                isSelf,
                              )
                            }
                            title={
                              isSelf
                                ? 'Lascia gruppo'
                                : 'Rimuovi membro dal gruppo'
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-xs">
                          {member.role === 'owner' && (
                            <Crown className="size-3 text-amber-500" />
                          )}
                          {member.role === 'owner' ? 'Gestore' : 'Membro'}
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </ScrollArea>
    </section>
  )
}
