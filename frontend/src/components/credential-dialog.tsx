import { useEffect, useState } from 'react'
import { Eye, EyeOff, Sparkles, Star } from 'lucide-react'
import { toast } from 'sonner'
import { PasswordGenerator } from '@/components/password-generator'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { vaultApi, type Credential, type Vault } from '@/lib/api'
import {
  CREDENTIAL_CATEGORIES,
  evaluatePasswordStrength,
} from '@/lib/utils'

interface CredentialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vaults: Vault[]
  defaultVaultId?: string
  editingCredential?: Credential | null
  onSaved: (credential: Credential) => void
}

export function CredentialDialog({
  open,
  onOpenChange,
  vaults,
  defaultVaultId,
  editingCredential,
  onSaved,
}: CredentialDialogProps) {
  const writableVaults = vaults.filter(
    (v) => v.role === 'owner' || v.role === 'editor',
  )

  const [vaultId, setVaultId] = useState('')
  const [title, setTitle] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState('login')
  const [notes, setNotes] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editingCredential) {
      setVaultId(editingCredential.vault_id)
      setTitle(editingCredential.title)
      setUsername(editingCredential.username)
      setPassword(editingCredential.password)
      setUrl(editingCredential.url)
      setCategory(editingCredential.category)
      setNotes(editingCredential.notes)
      setFavorite(editingCredential.favorite)
    } else {
      const preferred =
        writableVaults.find((v) => v.id === defaultVaultId)?.id ??
        writableVaults[0]?.id ??
        ''
      setVaultId(preferred)
      setTitle('')
      setUsername('')
      setPassword('')
      setUrl('')
      setCategory('login')
      setNotes('')
      setFavorite(false)
    }
    setShowPassword(false)
    setGenOpen(false)
  }, [open, editingCredential, defaultVaultId])

  const strength = evaluatePasswordStrength(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vaultId) {
      toast.error('Seleziona una cartella di destinazione')
      return
    }
    if (!title.trim()) {
      toast.error('Inserisci un titolo')
      return
    }
    if (!password) {
      toast.error('Inserisci o genera una password')
      return
    }

    setSubmitting(true)
    try {
      const saved = editingCredential
        ? await vaultApi.updateCredential(editingCredential.id, {
            vault_id: vaultId,
            title: title.trim(),
            username: username.trim(),
            password,
            url: url.trim(),
            category,
            notes: notes.trim(),
            favorite,
          })
        : await vaultApi.createCredential({
            vault_id: vaultId,
            title: title.trim(),
            username: username.trim(),
            password,
            url: url.trim(),
            category,
            notes: notes.trim(),
            favorite,
          })

      toast.success(
        editingCredential
          ? `Credenziale "${saved.title}" aggiornata`
          : `Credenziale "${saved.title}" salvata`,
      )
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore nel salvataggio credenziale',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingCredential ? 'Modifica credenziale' : 'Nuova credenziale'}
          </DialogTitle>
          <DialogDescription>
            Password e note vengono cifrate con AES-256-GCM nel vault
            centralizzato.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cartella</Label>
              <Select value={vaultId} onValueChange={setVaultId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona cartella" />
                </SelectTrigger>
                <SelectContent>
                  {writableVaults.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.is_shared_with_me ? ' (Condivisa)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREDENTIAL_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cred-title">Titolo</Label>
            <Input
              id="cred-title"
              placeholder="es. AWS Console, GitHub Team, PostgreSQL Prod..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cred-username">Username / Email</Label>
            <Input
              id="cred-username"
              placeholder="admin@azienda.it"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="cred-password">Password / Segreto</Label>
              <Popover open={genOpen} onOpenChange={setGenOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-primary"
                  >
                    <Sparkles className="size-3.5" />
                    Genera password
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <PasswordGenerator
                    onSelect={(generated) => {
                      setPassword(generated)
                      setShowPassword(true)
                      setGenOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="relative">
              <Input
                id="cred-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Inserisci o genera una password sicura"
                className="pr-10 font-mono text-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>

            {password && (
              <div className="flex items-center gap-2 pt-0.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all duration-300 ${strength.colorClass}`}
                    style={{ width: `${strength.percent}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cred-url">URL / Endpoint (opzionale)</Label>
            <Input
              id="cred-url"
              placeholder="https://console.example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cred-notes">Note cifrate (opzionale)</Label>
            <Textarea
              id="cred-notes"
              placeholder="Codici di recupero, dettagli VPN, istruzioni accesso..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-20"
            />
          </div>

          <label className="flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Star className="size-4 text-amber-500" />
              Aggiungi ai preferiti
            </span>
            <Switch checked={favorite} onCheckedChange={setFavorite} />
          </label>

          <DialogFooter className="pt-1">
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
                : editingCredential
                  ? 'Salva modifiche'
                  : 'Salva credenziale'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
