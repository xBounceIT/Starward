import { useEffect, useMemo, useState } from 'react'
import { Crown, Trash2, UserPlus, Users } from 'lucide-react'
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
import { vaultApi, type UserSummary, type Vault } from '@/lib/api'
import { getInitials } from '@/lib/vault-utils'

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
  const [selectedUserId, setSelectedUserId] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null)

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

  if (!vault) return null

  const handleShare = async (e: React.FormEvent) => {
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

  const handleRoleChange = async (
    memberId: string,
    newRole: 'editor' | 'viewer',
  ) => {
    setBusyMemberId(memberId)
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
      setBusyMemberId(null)
    }
  }

  const handleRemove = async (memberId: string, memberEmail: string, isSelf: boolean) => {
    setBusyMemberId(memberId)
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
          member_count: nextMembers.length,
          is_shared: nextMembers.length > 1,
        })
        toast.success(`Accesso rimosso per ${memberEmail}`)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Condivisione cartella "{vault.name}"
          </DialogTitle>
          <DialogDescription>
            Tutti gli utenti aggiunti vedranno questa cartella condivisa nella
            propria sidebar con accesso live alle credenziali contenute.
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <form onSubmit={handleShare} className="space-y-3">
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
                  <SelectContent position="popper" className="max-h-64 max-w-sm">
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
                    submitting || !selectedUserId || availableUsers.length === 0
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
                    : 'Tutti gli utenti registrati hanno già accesso a questa cartella.'
                  : role === 'editor'
                    ? 'Editor: può visualizzare, copiare, aggiungere e modificare le credenziali nella cartella.'
                    : 'Sola lettura: può visualizzare e copiare le credenziali senza modificarle.'}
              </p>
            </div>
          </form>
        )}

        <Separator />

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Persone con accesso ({vault.members.length})
            </span>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {vault.members.map((member) => {
              const isSelf = member.user_id === currentUserId
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
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
                          <Badge variant="outline" className="py-0 text-[10px]">
                            In attesa di accesso
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {member.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {member.role === 'owner' ? (
                      <Badge variant="secondary" className="gap-1">
                        <Crown className="size-3 text-amber-500" />
                        Proprietario
                      </Badge>
                    ) : isOwner ? (
                      <>
                        <Select
                          value={member.role}
                          disabled={busyMemberId === member.id}
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
                            <SelectItem value="viewer">Sola lettura</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={busyMemberId === member.id}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            handleRemove(member.id, member.email, false)
                          }
                          title="Revoca accesso"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {member.role === 'editor' ? 'Editor' : 'Sola lettura'}
                        </Badge>
                        {isSelf && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyMemberId === member.id}
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() =>
                              handleRemove(member.id, member.email, true)
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
