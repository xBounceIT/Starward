import { useEffect, useMemo, useState } from 'react'
import { Crown, Share2, Trash2, User, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  vaultApi,
  type GroupSummary,
  type UserSummary,
  type Vault,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { getInitials, getVaultColor } from '@/lib/vault-utils'

interface ShareVaultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vault: Vault | null
  currentUserId: string
  onVaultUpdated: (vault: Vault) => void
  onLeftVault: (vaultId: string) => void
}

export function ShareVaultDialog({
  open,
  onOpenChange,
  vault,
  currentUserId,
  onVaultUpdated,
  onLeftVault,
}: ShareVaultDialogProps) {
  const [shareMode, setShareMode] = useState<'user' | 'group'>('user')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [groupRole, setGroupRole] = useState<'editor' | 'viewer'>('editor')
  const [availableGroups, setAvailableGroups] = useState<GroupSummary[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const isOwner = vault?.role === 'owner'

  useEffect(() => {
    setSelectedUserId('')
    if (!open || !isOwner) return

    let active = true
    setLoadingUsers(true)
    vaultApi
      .searchUsers()
      .then((list) => {
        if (!active) return
        setUsers(list)
      })
      .catch(() => {
        if (!active) return
        setUsers([])
        toast.error('Errore nel caricamento degli utenti')
      })
      .finally(() => {
        if (active) setLoadingUsers(false)
      })

    return () => {
      active = false
    }
  }, [open, isOwner, vault?.id])

  const availableUsers = useMemo(() => {
    const memberUserIds = new Set(
      (vault?.members ?? [])
        .map((m) => m.user_id)
        .filter((id): id is string => Boolean(id)),
    )
    const memberEmails = new Set(
      (vault?.members ?? []).map((m) => m.email.toLowerCase()),
    )

    return users.filter(
      (u) =>
        u.id !== currentUserId &&
        !memberUserIds.has(u.id) &&
        !memberEmails.has(u.email.toLowerCase()),
    )
  }, [users, vault?.members, currentUserId])

  useEffect(() => {
    if (
      selectedUserId &&
      !availableUsers.some((u) => u.id === selectedUserId)
    ) {
      setSelectedUserId('')
    }
  }, [availableUsers, selectedUserId])

  useEffect(() => {
    if (!open || !isOwner) return
    let active = true
    vaultApi
      .searchGroups('')
      .then((list) => {
        if (!active) return
        const alreadyShared = new Set(
          (vault?.shared_groups ?? []).map((sg) => sg.group_id),
        )
        const filtered = list.filter((g) => !alreadyShared.has(g.id))
        setAvailableGroups(filtered)
        setSelectedGroupId((prev) =>
          filtered.some((g) => g.id === prev) ? prev : (filtered[0]?.id ?? ''),
        )
      })
      .catch(() => {
        // ignore group directory errors
      })

    return () => {
      active = false
    }
  }, [open, isOwner, vault?.shared_groups])

  if (!vault) return null

  const handleShareUser = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetUser = availableUsers.find((u) => u.id === selectedUserId)
    if (!targetUser) {
      toast.error('Seleziona un utente con cui condividere la cartella')
      return
    }

    setSubmitting(true)
    try {
      const updated = await vaultApi.shareVault(vault.id, {
        user_id: targetUser.id,
        email: targetUser.email,
        role,
      })
      onVaultUpdated(updated)
      setSelectedUserId('')
      toast.success(
        `Cartella condivisa con ${targetUser.name || targetUser.email}`,
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore durante la condivisione',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleShareGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGroupId) {
      toast.error('Seleziona un gruppo con cui condividere la cartella')
      return
    }

    const targetGroup = availableGroups.find((g) => g.id === selectedGroupId)
    setSubmitting(true)
    try {
      const updated = await vaultApi.shareVaultWithGroup(vault.id, {
        group_id: selectedGroupId,
        role: groupRole,
      })
      onVaultUpdated(updated)
      toast.success(
        targetGroup
          ? `Cartella condivisa con il gruppo "${targetGroup.name}"`
          : 'Cartella condivisa con il gruppo',
      )
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore durante la condivisione con il gruppo',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleRoleChange = async (
    memberId: string,
    newRole: 'editor' | 'viewer',
  ) => {
    setBusyId(memberId)
    try {
      const updated = await vaultApi.updateMemberRole(
        vault.id,
        memberId,
        newRole,
      )
      onVaultUpdated(updated)
      toast.success('Permessi aggiornati')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore aggiornamento ruolo',
      )
    } finally {
      setBusyId(null)
    }
  }

  const handleRemoveMember = async (
    memberId: string,
    memberEmail: string,
    isSelf: boolean,
  ) => {
    setBusyId(memberId)
    try {
      await vaultApi.removeMember(vault.id, memberId)
      if (isSelf) {
        toast.success(`Hai lasciato la cartella "${vault.name}"`)
        onLeftVault(vault.id)
        onOpenChange(false)
      } else {
        const nextMembers = vault.members.filter((m) => m.id !== memberId)
        onVaultUpdated({
          ...vault,
          members: nextMembers,
          member_count: Math.max(1, vault.member_count - 1),
          is_shared: nextMembers.length > 1 || vault.shared_groups.length > 0,
        })
        toast.success(`Accesso rimosso per ${memberEmail}`)
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore rimozione membro',
      )
    } finally {
      setBusyId(null)
    }
  }

  const handleGroupRoleChange = async (
    groupId: string,
    newRole: 'editor' | 'viewer',
  ) => {
    setBusyId(`group:${groupId}`)
    try {
      const updated = await vaultApi.updateVaultGroupRole(
        vault.id,
        groupId,
        newRole,
      )
      onVaultUpdated(updated)
      toast.success('Permessi del gruppo aggiornati')
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore aggiornamento permessi gruppo',
      )
    } finally {
      setBusyId(null)
    }
  }

  const handleRemoveGroup = async (groupId: string, groupName: string) => {
    setBusyId(`group:${groupId}`)
    try {
      await vaultApi.removeVaultGroup(vault.id, groupId)
      const nextGroups = vault.shared_groups.filter(
        (sg) => sg.group_id !== groupId,
      )
      onVaultUpdated({
        ...vault,
        shared_groups: nextGroups,
        group_count: nextGroups.length,
        is_shared: vault.members.length > 1 || nextGroups.length > 0,
      })
      toast.success(`Accesso rimosso per il gruppo "${groupName}"`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore rimozione gruppo',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Condivisione cartella "{vault.name}"
          </DialogTitle>
          <DialogDescription>
            Condividi questa cartella con singoli utenti oppure con interi gruppi
            di lavoro.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {isOwner && (
            <div className="space-y-3">
              {/* Mode switcher: User vs Group */}
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setShareMode('user')}
                  className={cn(
                    'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors',
                    shareMode === 'user'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <User className="size-3.5" />
                  Condividi con utente
                </button>
                <button
                  type="button"
                  onClick={() => setShareMode('group')}
                  className={cn(
                    'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors',
                    shareMode === 'group'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Users className="size-3.5" />
                  Condividi con gruppo
                </button>
              </div>

              {shareMode === 'user' ? (
                <form onSubmit={handleShareUser} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="share-user">Seleziona utente</Label>
                    <div className="flex gap-2">
                      <Select
                        value={selectedUserId}
                        onValueChange={setSelectedUserId}
                        disabled={loadingUsers || availableUsers.length === 0}
                      >
                        <SelectTrigger
                          id="share-user"
                          className="min-w-0 flex-1 *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:overflow-hidden"
                        >
                          <SelectValue
                            placeholder={
                              loadingUsers
                                ? 'Caricamento utenti...'
                                : availableUsers.length === 0
                                  ? 'Nessun utente disponibile'
                                  : 'Seleziona un utente...'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent
                          position="popper"
                          className="max-h-64 max-w-sm"
                        >
                          {availableUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              <span className="flex min-w-0 items-center gap-2">
                                <Avatar className="size-5 shrink-0">
                                  <AvatarFallback className="text-[10px]">
                                    {getInitials(user.name || user.email)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="truncate font-medium">
                                  {user.name}
                                </span>
                                <span className="truncate text-xs text-muted-foreground">
                                  ({user.email})
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={role}
                        onValueChange={(v) => setRole(v as 'editor' | 'viewer')}
                      >
                        <SelectTrigger className="w-36 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Sola lettura</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="submit"
                        disabled={
                          submitting ||
                          !selectedUserId ||
                          availableUsers.length === 0
                        }
                        className="shrink-0"
                      >
                        <UserPlus className="size-4" />
                        Condividi
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {!loadingUsers && availableUsers.length === 0
                        ? users.length === 0
                          ? 'Non ci sono altri utenti registrati disponibili da aggiungere.'
                          : 'Tutti gli utenti registrati hanno già accesso diretto a questa cartella.'
                        : role === 'editor'
                          ? 'Editor: può visualizzare, copiare, aggiungere e modificare le credenziali nella cartella.'
                          : 'Sola lettura: può visualizzare e copiare le credenziali senza modificarle.'}
                    </p>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleShareGroup} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Seleziona gruppo</Label>
                    {availableGroups.length === 0 ? (
                      <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
                        Nessun altro gruppo disponibile da aggiungere. Puoi
                        creare un nuovo gruppo dalla sezione Gruppi nella
                        sidebar.
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <Select
                            value={selectedGroupId}
                            onValueChange={setSelectedGroupId}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Scegli un gruppo..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableGroups.map((g) => (
                                <SelectItem key={g.id} value={g.id}>
                                  <span className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        'size-2 rounded-full',
                                        getVaultColor(g.color).dot,
                                      )}
                                    />
                                    <span>{g.name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      ({g.member_count}{' '}
                                      {g.member_count === 1
                                        ? 'membro'
                                        : 'membri'}
                                      )
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select
                            value={groupRole}
                            onValueChange={(v) =>
                              setGroupRole(v as 'editor' | 'viewer')
                            }
                          >
                            <SelectTrigger className="w-36 shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="viewer">
                                Sola lettura
                              </SelectItem>
                            </SelectContent>
                          </Select>

                          <Button
                            type="submit"
                            disabled={submitting}
                            className="shrink-0"
                          >
                            <Share2 className="size-4" />
                            Condividi
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Tutti i membri attuali e futuri del gruppo avranno
                          automaticamente accesso a questa cartella.
                        </p>
                      </>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}

          <Separator />

          {/* Shared Groups List */}
          {vault.shared_groups.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Gruppi con accesso ({vault.shared_groups.length})
                </span>
              </div>

              <div className="space-y-2">
                {vault.shared_groups.map((sg) => {
                  const palette = getVaultColor(sg.group_color)
                  const isBusy = busyId === `group:${sg.group_id}`
                  return (
                    <div
                      key={sg.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-lg',
                            palette.bg,
                            palette.text,
                          )}
                        >
                          <Users className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-medium">
                              {sg.group_name}
                            </p>
                            {sg.is_owner_group && (
                              <Badge
                                variant="secondary"
                                className="gap-1 py-0 text-[10px]"
                              >
                                <Crown className="size-2.5 text-amber-500" />
                                Gruppo proprietario
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {sg.member_count}{' '}
                            {sg.member_count === 1 ? 'membro' : 'membri'}
                            {sg.is_owner_group
                              ? ' · Gestori del gruppo hanno accesso completo'
                              : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {isOwner ? (
                          <>
                            <Select
                              value={sg.role}
                              disabled={isBusy}
                              onValueChange={(v) =>
                                handleGroupRoleChange(
                                  sg.group_id,
                                  v as 'editor' | 'viewer',
                                )
                              }
                            >
                              <SelectTrigger className="h-8 w-32 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="editor">Editor</SelectItem>
                                <SelectItem value="viewer">
                                  Sola lettura
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {!sg.is_owner_group && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={isBusy}
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() =>
                                  handleRemoveGroup(sg.group_id, sg.group_name)
                                }
                                title="Revoca accesso al gruppo"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </>
                        ) : (
                          <Badge variant="outline">
                            {sg.role === 'editor' ? 'Editor' : 'Sola lettura'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Direct User Members List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Persone con accesso diretto ({vault.members.length})
              </span>
            </div>

            {vault.members.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-center text-xs text-muted-foreground">
                {vault.owner_group_name
                  ? `Nessun utente individuale extra: tutti i membri del gruppo "${vault.owner_group_name}" hanno già accesso automatico.`
                  : 'Nessun membro diretto configurato.'}
              </p>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {vault.members.map((member) => {
                  const isSelf = member.user_id === currentUserId
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar className="size-8">
                          <AvatarFallback>
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
                                In attesa di accesso
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {member.role === 'owner' ? (
                          <Badge variant="secondary" className="gap-1">
                            <Crown className="size-3 text-amber-500" />
                            Proprietario
                          </Badge>
                        ) : isOwner ? (
                          <>
                            <Select
                              value={member.role}
                              disabled={busyId === member.id}
                              onValueChange={(v) =>
                                handleRoleChange(
                                  member.id,
                                  v as 'editor' | 'viewer',
                                )
                              }
                            >
                              <SelectTrigger className="h-8 w-32 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="editor">Editor</SelectItem>
                                <SelectItem value="viewer">
                                  Sola lettura
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={busyId === member.id}
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                handleRemoveMember(
                                  member.id,
                                  member.email,
                                  false,
                                )
                              }
                              title="Revoca accesso"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {member.role === 'editor'
                                ? 'Editor'
                                : 'Sola lettura'}
                            </Badge>
                            {isSelf && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={busyId === member.id}
                                className="h-7 text-xs text-destructive hover:text-destructive"
                                onClick={() =>
                                  handleRemoveMember(
                                    member.id,
                                    member.email,
                                    true,
                                  )
                                }
                              >
                                Lascia
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
