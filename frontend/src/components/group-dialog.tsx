import { useEffect, useState } from 'react'
import { UserCheck, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { vaultApi, type Group, type UserSummary } from '@/lib/api'
import { cn } from '@/lib/utils'
import { VAULT_COLORS } from '@/lib/vault-utils'

interface GroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingGroup?: Group | null
  onSaved: (group: Group) => void
}

export function GroupDialog({
  open,
  onOpenChange,
  editingGroup,
  onSaved,
}: GroupDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('indigo')
  const [memberInput, setMemberInput] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<UserSummary[]>([])
  const [suggestions, setSuggestions] = useState<UserSummary[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName(editingGroup?.name ?? '')
      setDescription(editingGroup?.description ?? '')
      setColor(editingGroup?.color ?? 'indigo')
      setMemberInput('')
      setSelectedMembers([])
      setSuggestions([])
    }
  }, [open, editingGroup])

  useEffect(() => {
    if (!open || editingGroup) return
    let active = true
    const timer = setTimeout(async () => {
      try {
        const users = await vaultApi.searchUsers(memberInput)
        if (!active) return
        const added = new Set(selectedMembers.map((u) => u.id))
        setSuggestions(users.filter((u) => !added.has(u.id)))
      } catch {
        // ignore autocomplete errors
      }
    }, 150)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [memberInput, selectedMembers, open, editingGroup])

  const addMember = (user: UserSummary) => {
    setSelectedMembers((prev) =>
      prev.some((m) => m.id === user.id) ? prev : [...prev, user],
    )
    setMemberInput('')
  }

  const removeMember = (userId: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== userId))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Inserisci un nome per il gruppo')
      return
    }

    setSubmitting(true)
    try {
      const saved = editingGroup
        ? await vaultApi.updateGroup(editingGroup.id, {
            name: name.trim(),
            description: description.trim(),
            color,
          })
        : await vaultApi.createGroup({
            name: name.trim(),
            description: description.trim(),
            color,
            member_ids: selectedMembers.map((u) => u.id),
          })

      toast.success(
        editingGroup
          ? `Gruppo "${saved.name}" aggiornato`
          : `Gruppo "${saved.name}" creato`,
      )
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore nel salvataggio del gruppo',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            {editingGroup ? 'Modifica gruppo' : 'Nuovo gruppo'}
          </DialogTitle>
          <DialogDescription>
            {editingGroup
              ? 'Aggiorna il nome, la descrizione o il colore del gruppo.'
              : 'Raggruppa gli utenti per condividere cartelle o creare cartelle condivise automaticamente con tutti i membri.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Nome gruppo</Label>
              <Input
                id="group-name"
                placeholder="es. DevOps, Engineering, Marketing..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Colore</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(VAULT_COLORS).map(([key, palette]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColor(key)}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                    color === key
                      ? 'border-primary bg-accent font-medium text-accent-foreground'
                      : 'hover:bg-muted',
                  )}
                >
                  <span className={cn('size-2.5 rounded-full', palette.dot)} />
                  {palette.label}
                </button>
              ))}
            </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-desc">Descrizione (opzionale)</Label>
            <Textarea
              id="group-desc"
              placeholder="Chi fa parte di questo gruppo o quale area gestisce?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-16"
            />
          </div>

          {!editingGroup && (
            <div className="space-y-2">
              <Label htmlFor="group-initial-member">
                Aggiungi membri iniziali (opzionale)
              </Label>
              <Input
                id="group-initial-member"
                type="text"
                placeholder="Cerca utenti per nome o email..."
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (suggestions.length > 0) {
                      addMember(suggestions[0])
                    }
                  }
                }}
              />

              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedMembers.map((u) => (
                    <Badge
                      key={u.id}
                      variant="secondary"
                      className="gap-1 pr-1 pl-2 text-xs"
                    >
                      <span>
                        {u.name}{' '}
                        <span className="text-muted-foreground">
                          ({u.email})
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeMember(u.id)}
                        className="rounded-md p-0.5 hover:bg-background/60"
                        aria-label={`Rimuovi ${u.name}`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-2">
                  <p className="mb-1.5 px-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                    Utenti della piattaforma
                  </p>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {suggestions.slice(0, 8).map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => addMember(u)}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
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

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Salvataggio...'
                : editingGroup
                  ? 'Salva modifiche'
                  : 'Crea gruppo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
