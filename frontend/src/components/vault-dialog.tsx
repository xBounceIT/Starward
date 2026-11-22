import { useEffect, useState } from 'react'
import { User, Users } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  getVaultDisplayIcon,
  VAULT_ICON_OPTIONS,
  VaultIcon,
} from '@/components/vault-icon'
import { VaultColorPicker } from '@/components/vault-color-picker'
import { vaultApi, type Group, type Vault } from '@/lib/api'
import { cn } from '@/lib/utils'
import { getVaultColor } from '@/lib/vault-utils'

interface VaultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingVault?: Vault | null
  groups?: Group[]
  defaultOwnerGroupId?: string | null
  onSaved: (vault: Vault) => void
}

export function VaultDialog({
  open,
  onOpenChange,
  editingVault,
  groups = [],
  defaultOwnerGroupId = null,
  onSaved,
}: VaultDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('folder')
  const [color, setColor] = useState('indigo')
  const [ownerType, setOwnerType] = useState<'personal' | 'group'>('personal')
  const [ownerGroupId, setOwnerGroupId] = useState('')
  const [groupRole, setGroupRole] = useState<'editor' | 'viewer'>('editor')
  const [submitting, setSubmitting] = useState(false)

  const eligibleGroups = groups.filter((g) => g.my_role !== null)

  useEffect(() => {
    if (open) {
      setName(editingVault?.name ?? '')
      setDescription(editingVault?.description ?? '')
      if (editingVault) {
        setIcon(getVaultDisplayIcon(editingVault))
        setColor(editingVault.color)
        setOwnerType(editingVault.owner_group_id ? 'group' : 'personal')
        setOwnerGroupId(editingVault.owner_group_id ?? '')
        setGroupRole('editor')
      } else if (
        defaultOwnerGroupId &&
        eligibleGroups.some((g) => g.id === defaultOwnerGroupId)
      ) {
        const targetGroup = eligibleGroups.find(
          (g) => g.id === defaultOwnerGroupId,
        )
        setOwnerType('group')
        setOwnerGroupId(defaultOwnerGroupId)
        // La cartella del gruppo è una cartella: icona predefinita "folder",
        // non l'icona "Team" del gruppo
        setIcon('folder')
        setColor(targetGroup?.color ?? 'indigo')
        setGroupRole('editor')
      } else {
        setIcon('folder')
        setColor('indigo')
        setOwnerType('personal')
        setOwnerGroupId(eligibleGroups[0]?.id ?? '')
        setGroupRole('editor')
      }
    }
  }, [open, editingVault, defaultOwnerGroupId])

  const selectedGroup = eligibleGroups.find((g) => g.id === ownerGroupId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Inserisci un nome per la cartella')
      return
    }

    if (!editingVault && ownerType === 'group' && !ownerGroupId) {
      toast.error('Seleziona un gruppo proprietario')
      return
    }

    setSubmitting(true)
    try {
      const saved = editingVault
        ? await vaultApi.updateVault(editingVault.id, {
            name: name.trim(),
            description: description.trim(),
            icon,
            color,
          })
        : await vaultApi.createVault({
            name: name.trim(),
            description: description.trim(),
            icon,
            color,
            owner_group_id: ownerType === 'group' ? ownerGroupId : null,
            group_role: ownerType === 'group' ? groupRole : undefined,
          })

      toast.success(
        editingVault
          ? `Cartella "${saved.name}" aggiornata`
          : saved.owner_group_name
            ? `Cartella "${saved.name}" creata per il gruppo "${saved.owner_group_name}"`
            : `Cartella "${saved.name}" creata`,
      )
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Errore nel salvataggio cartella',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {editingVault ? 'Modifica cartella' : 'Nuova cartella vault'}
          </DialogTitle>
          <DialogDescription>
            Organizza le credenziali in cartelle dedicate e condividile con
            colleghi o gruppi specifici.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto pr-1 sm:grid-cols-[1.35fr_1fr]">
            <div className="space-y-4">
              {editingVault?.owner_group_name && (
                <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs">
                  <Users
                    className={cn(
                      'size-4 shrink-0',
                      getVaultColor(editingVault.owner_group_color ?? 'indigo')
                        .text,
                    )}
                    style={
                      getVaultColor(editingVault.owner_group_color ?? 'indigo')
                        .style
                    }
                  />
                  <span className="text-muted-foreground">
                    Cartella del gruppo
                  </span>
                  <Badge variant="secondary" className="font-medium">
                    {editingVault.owner_group_name}
                  </Badge>
                </div>
              )}

              {!editingVault && eligibleGroups.length > 0 && (
                <div className="space-y-2">
                  <Label>Proprietà cartella</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOwnerType('personal')}
                      className={cn(
                        'flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                        ownerType === 'personal'
                          ? 'border-primary bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <User className="size-3.5" />A mio nome
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOwnerType('group')
                        if (!ownerGroupId && eligibleGroups[0]) {
                          setOwnerGroupId(eligibleGroups[0].id)
                        }
                      }}
                      className={cn(
                        'flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                        ownerType === 'group'
                          ? 'border-primary bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Users className="size-3.5" />A nome di un gruppo
                    </button>
                  </div>

                  {ownerType === 'group' && (
                    <div className="space-y-2.5 rounded-lg border border-border/70 bg-muted/30 p-3">
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Gruppo</Label>
                          <Select
                            value={ownerGroupId}
                            onValueChange={setOwnerGroupId}
                          >
                            <SelectTrigger className="h-9 w-full text-xs">
                              <SelectValue placeholder="Seleziona gruppo" />
                            </SelectTrigger>
                            <SelectContent>
                              {eligibleGroups.map((g) => (
                                <SelectItem key={g.id} value={g.id}>
                                  <span className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        'size-2 rounded-full',
                                        getVaultColor(g.color).dot,
                                      )}
                                      style={getVaultColor(g.color).style}
                                    />
                                    <span>{g.name}</span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Permessi membri</Label>
                          <Select
                            value={groupRole}
                            onValueChange={(v) =>
                              setGroupRole(v as 'editor' | 'viewer')
                            }
                          >
                            <SelectTrigger className="h-9 w-full text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="viewer">Sola lettura</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        La cartella verrà condivisa automaticamente con tutti i{' '}
                        {selectedGroup
                          ? `${selectedGroup.member_count} membri`
                          : 'membri'}{' '}
                        del gruppo (inclusi i futuri membri aggiunti).
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="vault-name">Nome cartella</Label>
                <Input
                  id="vault-name"
                  placeholder="es. Infrastruttura Prod, Team Marketing..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vault-desc">Descrizione (opzionale)</Label>
                <Textarea
                  id="vault-desc"
                  placeholder="A cosa serve questa cartella?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-16"
                />
              </div>

            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Icona</Label>
                <div className="grid grid-cols-4 gap-2">
                  {VAULT_ICON_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setIcon(opt.value)}
                      className={cn(
                        'flex cursor-pointer flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors',
                        icon === opt.value
                          ? 'border-primary bg-accent font-medium text-accent-foreground'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <VaultIcon icon={opt.value} className="size-4" />
                      <span className="truncate">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Colore</Label>
                <VaultColorPicker value={color} onChange={setColor} />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-3">
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
                : editingVault
                  ? 'Salva modifiche'
                  : 'Crea cartella'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
