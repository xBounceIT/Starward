import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { VAULT_ICON_OPTIONS, VaultIcon } from '@/components/vault-icon'
import { vaultApi, type Vault } from '@/lib/api'
import { cn } from '@/lib/utils'
import { VAULT_COLORS } from '@/lib/vault-utils'

interface VaultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingVault?: Vault | null
  onSaved: (vault: Vault) => void
}

export function VaultDialog({
  open,
  onOpenChange,
  editingVault,
  onSaved,
}: VaultDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('folder')
  const [color, setColor] = useState('indigo')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName(editingVault?.name ?? '')
      setDescription(editingVault?.description ?? '')
      setIcon(editingVault?.icon ?? 'folder')
      setColor(editingVault?.color ?? 'indigo')
    }
  }, [open, editingVault])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Inserisci un nome per la cartella')
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
          })

      toast.success(
        editingVault
          ? `Cartella "${saved.name}" aggiornata`
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingVault ? 'Modifica cartella' : 'Nuova cartella vault'}
          </DialogTitle>
          <DialogDescription>
            Organizza le credenziali in cartelle dedicate e condividile con
            colleghi o team specifici.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="space-y-2">
            <Label>Icona</Label>
            <div className="grid grid-cols-4 gap-2">
              {VAULT_ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setIcon(opt.value)}
                  className={cn(
                    'flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors',
                    icon === opt.value
                      ? 'border-primary bg-accent text-accent-foreground font-medium'
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
            <div className="flex flex-wrap gap-2">
              {Object.entries(VAULT_COLORS).map(([key, palette]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColor(key)}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                    color === key
                      ? 'border-primary bg-accent text-accent-foreground font-medium'
                      : 'hover:bg-muted',
                  )}
                >
                  <span className={cn('size-2.5 rounded-full', palette.dot)} />
                  {palette.label}
                </button>
              ))}
            </div>
          </div>

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
