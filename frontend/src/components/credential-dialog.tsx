import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { OtpCodeCard } from '@/components/otp-code-card'
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
import {
  buildTotpStorageValue,
  parseTotpConfig,
  type OtpAlgorithm,
} from '@/lib/otp'
import {
  evaluatePasswordStrength,
  type PasswordOptions,
} from '@/lib/vault-utils'
import { cn } from '@/lib/utils'

interface CredentialDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vaults: Vault[]
  defaultVaultId?: string
  defaultPasswordOptions?: PasswordOptions
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
  defaultPasswordOptions,
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
  const [otpAdvancedOpen, setOtpAdvancedOpen] = useState(false)
  const [showOptionalOtp, setShowOptionalOtp] = useState(false)
  const [otpPeriodDraft, setOtpPeriodDraft] = useState('30')
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
      setShowOptionalOtp(Boolean(editingCredential.fields?.totp?.trim()))
      const existingTotp = editingCredential.fields?.totp?.trim()
      if (existingTotp) {
        const parsedExisting = parseTotpConfig(existingTotp)
        setOtpPeriodDraft(
          parsedExisting.ok ? String(parsedExisting.config.period) : '30',
        )
      } else {
        setOtpPeriodDraft('30')
      }
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
      setShowOptionalOtp(false)
      setOtpPeriodDraft('30')
    }
    setRevealedFields({})
    setGenOpen(false)
    setOtpAdvancedOpen(false)
  }, [open, editingCredential, defaultVaultId])

  const categoryConfig = getCategoryConfig(category)
  const hasCategoryTotpField = categoryConfig.fields.some(
    (f) => f.type === 'totp',
  )
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
      case 'passkey':
        if (
          !extraValues.rp_id?.trim() &&
          !extraValues.credential_id?.trim() &&
          !extraValues.private_key?.trim()
        ) {
          toast.error(
            'Inserisci almeno il Relying Party ID (RP ID), il Credential ID o la chiave privata della passkey',
          )
          return false
        }
        return true
      case 'identity': {
        const hasAnyExtra = categoryConfig.fields.some(
          (f) => f.storage === 'extra' && Boolean(extraValues[f.key]?.trim()),
        )
        if (
          !coreValues.username.trim() &&
          !coreValues.notes.trim() &&
          !hasAnyExtra
        ) {
          toast.error(
            "Inserisci almeno un dato dell'identità (es. nome, email, telefono, indirizzo o documento)",
          )
          return false
        }
        return true
      }
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
      if (field.storage === 'extra' && field.type !== 'totp') {
        const val = extraValues[field.key]?.trim()
        if (val) {
          payloadFields[field.key] = val
        }
      }
    }

    const rawTotp = extraValues.totp?.trim() ?? ''
    if (rawTotp) {
      if (otpAdvancedOpen) {
        const periodRaw = otpPeriodDraft.trim()
        if (!/^\d+$/.test(periodRaw)) {
          toast.error('Il periodo OTP deve essere compreso tra 10 e 300 secondi')
          return
        }
        const periodNum = Number.parseInt(periodRaw, 10)
        if (periodNum < 10 || periodNum > 300) {
          toast.error('Il periodo OTP deve essere compreso tra 10 e 300 secondi')
          return
        }
      }
      const parsedTotp = parseTotpConfig(rawTotp)
      if (!parsedTotp.ok) {
        toast.error(parsedTotp.error)
        return
      }
      payloadFields.totp = rawTotp.toLowerCase().startsWith('otpauth://')
        ? rawTotp
        : parsedTotp.config.secretBase32
    }

    if (extraValues.tags?.trim()) {
      payloadFields.tags = extraValues.tags.trim()
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

  const renderTotpEditor = (options?: { allowCollapse?: boolean }) => {
    const totpRaw = extraValues.totp ?? ''
    const trimmedTotp = totpRaw.trim()
    const parsedTotp = trimmedTotp ? parseTotpConfig(trimmedTotp) : null
    const isRevealed = Boolean(revealedFields.totp)
    const activeAlgorithm: OtpAlgorithm = parsedTotp?.ok
      ? parsedTotp.config.algorithm
      : 'SHA1'
    const activeDigits = parsedTotp?.ok ? parsedTotp.config.digits : 6
    const activePeriod = parsedTotp?.ok ? parsedTotp.config.period : 30

    const applyAdvancedParams = (next: {
      algorithm?: OtpAlgorithm
      digits?: number
      period?: number
    }) => {
      if (!parsedTotp?.ok) return
      const nextAlg = next.algorithm ?? parsedTotp.config.algorithm
      const nextDigits = next.digits ?? parsedTotp.config.digits
      const nextPeriod = next.period ?? parsedTotp.config.period
      const nextStorage = buildTotpStorageValue({
        secretBase32: parsedTotp.config.secretBase32,
        algorithm: nextAlg,
        digits: nextDigits,
        period: nextPeriod,
        issuer: parsedTotp.config.issuer,
        label: parsedTotp.config.label ?? (title.trim() || undefined),
      })
      setExtraValues((prev) => ({ ...prev, totp: nextStorage }))
      setOtpPeriodDraft(String(nextPeriod))
    }

    return (
      <div key="totp" className="space-y-2 sm:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="cred-field-totp" className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-primary sync-security:text-[#ff9c00]" />
            <span>Codice OTP (2FA / TOTP)</span>
          </Label>

          <div className="flex items-center gap-1">
            {parsedTotp?.ok && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setOtpAdvancedOpen((prev) => !prev)}
              >
                {otpAdvancedOpen ? (
                  <ChevronUp className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
                Parametri avanzati
              </Button>
            )}
            {options?.allowCollapse && !trimmedTotp && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowOptionalOtp(false)}
              >
                Rimuovi
              </Button>
            )}
          </div>
        </div>

        <div className="relative">
          <Input
            id="cred-field-totp"
            type={isRevealed ? 'text' : 'password'}
            value={totpRaw}
            onChange={(e) => {
              const nextVal = e.target.value
              setExtraValues((prev) => ({ ...prev, totp: nextVal }))
              const nextParsed = nextVal.trim()
                ? parseTotpConfig(nextVal.trim())
                : null
              if (nextParsed?.ok) {
                setOtpPeriodDraft(String(nextParsed.config.period))
              }
            }}
            placeholder="Chiave Base32 (es. JBSWY3DPEHPK3PXP) o URI otpauth://totp/..."
            className={totpRaw ? 'pr-16' : 'pr-10'}
          />
          <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
            {totpRaw && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setExtraValues((prev) => {
                    const next = { ...prev }
                    delete next.totp
                    return next
                  })
                  setOtpAdvancedOpen(false)
                  setOtpPeriodDraft('30')
                }}
                className="text-muted-foreground"
                tabIndex={-1}
                aria-label="Rimuovi segreto OTP"
                title="Rimuovi segreto OTP"
              >
                <X className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => toggleReveal('totp')}
              className="text-muted-foreground"
              tabIndex={-1}
              aria-label={
                isRevealed ? 'Nascondi segreto OTP' : 'Mostra segreto OTP'
              }
            >
              {isRevealed ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </Button>
          </div>
        </div>

        {otpAdvancedOpen && parsedTotp?.ok && (
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/70 bg-muted/30 p-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Algoritmo
              </Label>
              <Select
                value={activeAlgorithm}
                onValueChange={(val) =>
                  applyAdvancedParams({ algorithm: val as OtpAlgorithm })
                }
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SHA1">SHA1</SelectItem>
                  <SelectItem value="SHA256">SHA256</SelectItem>
                  <SelectItem value="SHA512">SHA512</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Cifre</Label>
              <Select
                value={String(activeDigits)}
                onValueChange={(val) =>
                  applyAdvancedParams({ digits: Number.parseInt(val, 10) })
                }
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6 cifre</SelectItem>
                  <SelectItem value="7">7 cifre</SelectItem>
                  <SelectItem value="8">8 cifre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label
                htmlFor="cred-field-totp-period"
                className="text-[11px] text-muted-foreground"
              >
                Periodo (s)
              </Label>
              <Input
                id="cred-field-totp-period"
                type="number"
                min={10}
                max={300}
                value={otpPeriodDraft}
                onChange={(e) => {
                  const val = e.target.value
                  setOtpPeriodDraft(val)
                  if (/^\d+$/.test(val)) {
                    const num = Number.parseInt(val, 10)
                    if (num >= 10 && num <= 300) {
                      applyAdvancedParams({ period: num })
                    }
                  }
                }}
                onBlur={() => setOtpPeriodDraft(String(activePeriod))}
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>
        )}

        {trimmedTotp &&
          parsedTotp &&
          (parsedTotp.ok ? (
            <OtpCodeCard
              totpValue={trimmedTotp}
              label="Anteprima codice OTP"
              compact
              showSecretToggle={false}
            />
          ) : (
            <p className="text-xs text-destructive">{parsedTotp.error}</p>
          ))}
      </div>
    )
  }

  const renderField = (field: CredentialFieldDef) => {
    if (field.type === 'totp') {
      return renderTotpEditor()
    }
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
                    defaultOptions={defaultPasswordOptions}
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
            className={field.rowsClass ?? 'min-h-20'}
            required={field.required}
          />
        ) : field.type === 'secret-textarea' ? (
          editingCredential && value && !isRevealed ? (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>
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
                'min-h-24',
                field.mono && 'font-mono text-xs',
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
              className="pr-10"
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
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
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
                        {v.owner_group_name
                          ? ` (${v.owner_group_name})`
                          : v.is_shared_with_me
                            ? ' (Condivisa)'
                            : ''}
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
                placeholder="es. AWS Console, GitHub Passkey, Identità Mario Rossi..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categoryConfig.fields.map(renderField)}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {!hasCategoryTotpField &&
                (showOptionalOtp || Boolean(extraValues.totp?.trim()) ? (
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    {renderTotpEditor({ allowCollapse: true })}
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2 border-dashed text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowOptionalOtp(true)}
                  >
                    <Plus className="size-3.5" />
                    Aggiungi codice OTP (2FA / TOTP)
                  </Button>
                ))}

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cred-tags">Tag (separati da virgola)</Label>
                  <Input
                    id="cred-tags"
                    placeholder="es. personale, produttività, cloud..."
                    value={extraValues.tags ?? ''}
                    onChange={(e) =>
                      setExtraValues((prev) => ({
                        ...prev,
                        tags: e.target.value,
                      }))
                    }
                  />
                </div>

                <label className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Star className="size-4 text-amber-500" />
                    Aggiungi ai preferiti
                  </span>
                  <Switch checked={favorite} onCheckedChange={setFavorite} />
                </label>
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
