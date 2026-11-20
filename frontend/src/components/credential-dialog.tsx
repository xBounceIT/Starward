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
import { Progress } from '@/components/ui/progress'
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
  getCategoryConfig,
  type CredentialFieldDef,
} from '@/lib/credential-types'
import { evaluatePasswordStrength } from '@/lib/vault-utils'
import { cn } from '@/lib/utils'

interface CredentialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vaults: Vault[]
  defaultVaultId?: string
  editingCredential?: Credential | null
  onSaved: (credential: Credential) => void
}

interface CoreFieldValues {
  username: string
  password: string
  url: string
  notes: string
}

const EMPTY_CORE_VALUES: CoreFieldValues = {
  username: '',
  password: '',
  url: '',
  notes: '',
}

const EMPTY_SELECT_VALUE = '__none__'

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
  const [category, setCategory] = useState('login')
  const [coreValues, setCoreValues] =
    useState<CoreFieldValues>(EMPTY_CORE_VALUES)
  const [extraValues, setExtraValues] = useState<Record<string, string>>({})
  const [favorite, setFavorite] = useState(false)
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>(
    {},
  )
  const [genOpen, setGenOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editingCredential) {
      setVaultId(editingCredential.vault_id)
      setTitle(editingCredential.title)
      setCategory(editingCredential.category)
      setCoreValues({
        username: editingCredential.username,
        password: editingCredential.password,
        url: editingCredential.url,
        notes: editingCredential.notes,
      })
      setExtraValues({ ...(editingCredential.fields ?? {}) })
      setFavorite(editingCredential.favorite)
    } else {
      const preferred =
        writableVaults.find((v) => v.id === defaultVaultId)?.id ??
        writableVaults[0]?.id ??
        ''
      setVaultId(preferred)
      setTitle('')
      setCategory('login')
      setCoreValues(EMPTY_CORE_VALUES)
      setExtraValues({})
      setFavorite(false)
    }
    setRevealedFields({})
    setGenOpen(false)
  }, [open, editingCredential, defaultVaultId])

  const categoryConfig = getCategoryConfig(category)
  const strength = evaluatePasswordStrength(coreValues.password)

  const getFieldValue = (field: CredentialFieldDef): string => {
    if (field.storage === 'core') {
      return coreValues[field.key as keyof CoreFieldValues] ?? ''
    }
    return extraValues[field.key] ?? ''
  }

  const setFieldValue = (field: CredentialFieldDef, value: string) => {
    if (field.storage === 'core') {
      setCoreValues((prev) => ({
        ...prev,
        [field.key]: value,
      }))
    } else {
      setExtraValues((prev) => ({
        ...prev,
        [field.key]: value,
      }))
    }
  }

  const toggleReveal = (key: string) => {
    setRevealedFields((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const validateForCategory = (): boolean => {
    switch (categoryConfig.value) {
      case 'note':
        if (!coreValues.notes.trim()) {
          toast.error('Inserisci il contenuto della nota sicura')
          return false
        }
        return true
      case 'ssh':
        if (!coreValues.password && !extraValues.private_key?.trim()) {
          toast.error('Inserisci una password o una chiave privata SSH')
          return false
        }
        return true
      case 'api_key':
        if (!coreValues.password) {
          toast.error('Inserisci la chiave API / token')
          return false
        }
        return true
      case 'card':
        if (!coreValues.password) {
          toast.error('Inserisci il numero della carta')
          return false
        }
        return true
      case 'license':
        if (!coreValues.password) {
          toast.error('Inserisci la chiave di licenza')
          return false
        }
        return true
      default:
        if (!coreValues.password) {
          toast.error('Inserisci o genera una password')
          return false
        }
        return true
    }
  }

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
    if (!validateForCategory()) {
      return
    }

    const activeCoreKeys = new Set(
      categoryConfig.fields
        .filter((f) => f.storage === 'core')
        .map((f) => f.key),
    )

    const payloadFields: Record<string, string> = {}
    for (const field of categoryConfig.fields) {
      if (field.storage === 'extra') {
        const val = extraValues[field.key]?.trim()
        if (val) {
          payloadFields[field.key] = val
        }
      }
    }

    const payload = {
      vault_id: vaultId,
      title: title.trim(),
      username: activeCoreKeys.has('username')
        ? coreValues.username.trim()
        : '',
      password: activeCoreKeys.has('password') ? coreValues.password : '',
      url: activeCoreKeys.has('url') ? coreValues.url.trim() : '',
      category: categoryConfig.value,
      notes: activeCoreKeys.has('notes') ? coreValues.notes.trim() : '',
      fields: payloadFields,
      favorite,
    }

    setSubmitting(true)
    try {
      const saved = editingCredential
        ? await vaultApi.updateCredential(editingCredential.id, payload)
        : await vaultApi.createCredential(payload)

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

  const renderField = (field: CredentialFieldDef) => {
    const fieldId = `cred-field-${field.key}`
    const value = getFieldValue(field)
    const isRevealed = Boolean(revealedFields[field.key])
    const colClass = field.colSpan === 1 ? 'sm:col-span-1' : 'sm:col-span-2'

    return (
      <div key={field.key} className={cn('space-y-1.5', colClass)}>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={fieldId}>{field.label}</Label>

          <div className="flex items-center gap-1">
            {field.type === 'secret-textarea' &&
              editingCredential &&
              Boolean(value) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => toggleReveal(field.key)}
                >
                  {isRevealed ? (
                    <>
                      <EyeOff className="size-3" />
                      Nascondi
                    </>
                  ) : (
                    <>
                      <Eye className="size-3" />
                      Mostra
                    </>
                  )}
                </Button>
              )}

            {field.showGenerator && field.key === 'password' && (
              <Popover open={genOpen} onOpenChange={setGenOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="xs">
                    <Sparkles className="size-3.5" />
                    Genera
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <PasswordGenerator
                    onSelect={(generated) => {
                      setCoreValues((prev) => ({
                        ...prev,
                        password: generated,
                      }))
                      setRevealedFields((prev) => ({
                        ...prev,
                        password: true,
                      }))
                      setGenOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {field.type === 'select' && field.options ? (
          <Select
            value={value || EMPTY_SELECT_VALUE}
            onValueChange={(next) =>
              setFieldValue(field, next === EMPTY_SELECT_VALUE ? '' : next)
            }
          >
            <SelectTrigger id={fieldId} className="w-full">
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_SELECT_VALUE}>Nessuno</SelectItem>
              {field.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : field.type === 'textarea' ? (
          <Textarea
            id={fieldId}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => setFieldValue(field, e.target.value)}
            className={cn(
              field.rowsClass ?? 'min-h-20',
              field.mono && 'font-mono text-xs',
            )}
            required={field.required}
          />
        ) : field.type === 'secret-textarea' ? (
          editingCredential && value && !isRevealed ? (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-mono">
                ••••••••••••••••••••••••••••••••
              </span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => toggleReveal(field.key)}
              >
                <Eye className="size-3" />
                Mostra / Modifica
              </Button>
            </div>
          ) : (
            <Textarea
              id={fieldId}
              placeholder={field.placeholder}
              value={value}
              onChange={(e) => setFieldValue(field, e.target.value)}
              className={cn(
                'min-h-24 font-mono text-xs',
                field.rowsClass,
              )}
              required={field.required}
            />
          )
        ) : field.secret ? (
          <div className="relative">
            <Input
              id={fieldId}
              type={isRevealed ? 'text' : 'password'}
              value={value}
              onChange={(e) => setFieldValue(field, e.target.value)}
              placeholder={field.placeholder}
              className={cn('pr-10', field.mono && 'font-mono text-sm')}
              required={field.required}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => toggleReveal(field.key)}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
              tabIndex={-1}
              aria-label={isRevealed ? 'Nascondi valore' : 'Mostra valore'}
            >
              {isRevealed ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </Button>
          </div>
        ) : (
          <Input
            id={fieldId}
            type={
              field.type === 'date'
                ? 'date'
                : field.type === 'url'
                  ? 'text'
                  : 'text'
            }
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => setFieldValue(field, e.target.value)}
            className={cn(field.mono && 'font-mono text-sm')}
            required={field.required}
          />
        )}

        {field.showStrength && field.key === 'password' && value && (
          <div className="flex items-center gap-2 pt-0.5">
            <Progress value={strength.percent} className="h-1.5 flex-1" />
            <span className="text-[11px] font-medium text-muted-foreground">
              {strength.label}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingCredential ? 'Modifica credenziale' : 'Nuova credenziale'}
          </DialogTitle>
          <DialogDescription>
            Tutti i campi sensibili vengono cifrati con AES-256-GCM nel vault
            centralizzato.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Cartella</Label>
                <Select value={vaultId} onValueChange={setVaultId}>
                  <SelectTrigger className="w-full">
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
                <Label>Tipologia</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full">
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
                placeholder="es. AWS Console, Postgres Prod, Carta aziendale..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {categoryConfig.fields.map(renderField)}
            </div>

            <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Star className="size-4 text-amber-500" />
                Aggiungi ai preferiti
              </span>
              <Switch checked={favorite} onCheckedChange={setFavorite} />
            </label>
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
