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
import {
  vaultApi,
  type Credential,
  type CustomField,
  type CustomFieldType,
  type Vault,
} from '@/lib/api'
import {
  CREDENTIAL_CATEGORIES,
  CUSTOM_FIELD_TYPE_OPTIONS,
  LINKED_FIELD_OPTIONS,
  LINKED_ID_USERNAME,
  getCategoryConfig,
  getCustomFieldTypeOption,
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
import { t } from '@/lib/i18n'

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
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [addFieldOpen, setAddFieldOpen] = useState(false)
  const [addFieldType, setAddFieldType] = useState<CustomFieldType>('text')
  const [addFieldLabel, setAddFieldLabel] = useState('')

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
      setCustomFields((editingCredential.custom_fields ?? []).map((f) => ({ ...f })))
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
      setCustomFields([])
      setFavorite(false)
      setShowOptionalOtp(false)
      setOtpPeriodDraft('30')
    }
    setRevealedFields({})
    setGenOpen(false)
    setOtpAdvancedOpen(false)
    setAddFieldOpen(false)
    setAddFieldType('text')
    setAddFieldLabel('')
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

  const updateCustomField = (idx: number, patch: Partial<CustomField>) => {
    setCustomFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    )
  }

  const removeCustomField = (idx: number) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== idx))
    setRevealedFields((prev) => {
      const next = { ...prev }
      delete next[`cf-${idx}`]
      return next
    })
  }

  const changeCustomFieldType = (idx: number, nextType: CustomFieldType) => {
    setCustomFields((prev) =>
      prev.map((f, i) => {
        if (i !== idx) return f
        const next: CustomField = { ...f, field_type: nextType }
        if (nextType === 'linked') {
          next.linked_id = f.linked_id ?? LINKED_ID_USERNAME
          next.value = ''
        } else {
          next.linked_id = undefined
        }
        if (nextType === 'checkbox') {
          next.value = f.value === 'true' ? 'true' : 'false'
        }
        return next
      }),
    )
  }

  const openAddFieldDialog = () => {
    setAddFieldType('text')
    setAddFieldLabel('')
    setAddFieldOpen(true)
  }

  const confirmAddField = () => {
    const label = addFieldLabel.trim()
    if (!label) return
    setCustomFields((prev) => [
      ...prev,
      {
        field_type: addFieldType,
        label,
        value: addFieldType === 'checkbox' ? 'false' : '',
        linked_id: addFieldType === 'linked' ? LINKED_ID_USERNAME : undefined,
      },
    ])
    setAddFieldOpen(false)
    setAddFieldLabel('')
    setAddFieldType('text')
  }

  const buildPayloadCustomFields = (): CustomField[] =>
    customFields
      .map((f) => ({ ...f, label: f.label.trim() }))
      .filter((f) => f.label.length > 0)
      .map((f) => {
        if (f.field_type === 'checkbox') {
          return {
            ...f,
            value: f.value === 'true' ? 'true' : 'false',
            linked_id: undefined,
          }
        }
        if (f.field_type === 'linked') {
          return {
            ...f,
            value: '',
            linked_id: f.linked_id ?? LINKED_ID_USERNAME,
          }
        }
        return { ...f, linked_id: undefined }
      })

  const validateForCategory = (): boolean => {
    switch (categoryConfig.value) {
      case 'passkey':
        if (
          !extraValues.rp_id?.trim() &&
          !extraValues.credential_id?.trim() &&
          !extraValues.private_key?.trim()
        ) {
          toast.error(
            t('credential-dialog.inserisci-almeno-il-relying-party-id-rp-id-il-cr'),
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
            t('credential-dialog.inserisci-almeno-un-dato-dell-identita-es-nome-e'),
          )
          return false
        }
        return true
      }
      case 'note':
        if (!coreValues.notes.trim()) {
          toast.error(t('credential-dialog.inserisci-il-contenuto-della-nota-sicura'))
          return false
        }
        return true
      case 'ssh':
        if (!coreValues.password && !extraValues.private_key?.trim()) {
          toast.error(t('credential-dialog.inserisci-una-password-o-una-chiave-privata-ssh'))
          return false
        }
        return true
      case 'api_key':
        if (!coreValues.password) {
          toast.error(t('credential-dialog.inserisci-la-chiave-api-token'))
          return false
        }
        return true
      case 'oauth2_client':
        if (!coreValues.username.trim() && !coreValues.password) {
          toast.error(
            t('credential-dialog.inserisci-almeno-client-id-o-client-secret'),
          )
          return false
        }
        return true
      case 'card':
        if (!coreValues.password) {
          toast.error(t('credential-dialog.inserisci-il-numero-della-carta'))
          return false
        }
        return true
      case 'license':
        if (!coreValues.password) {
          toast.error(t('credential-dialog.inserisci-la-chiave-di-licenza'))
          return false
        }
        return true
      default:
        if (!coreValues.password) {
          toast.error(t('credential-dialog.inserisci-o-genera-una-password'))
          return false
        }
        return true
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vaultId) {
      toast.error(t('credential-dialog.seleziona-una-cartella-di-destinazione'))
      return
    }
    if (!title.trim()) {
      toast.error(t('credential-dialog.inserisci-un-titolo'))
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
          toast.error(t('credential-dialog.il-periodo-otp-deve-essere-compreso-tra-10-e-300'))
          return
        }
        const periodNum = Number.parseInt(periodRaw, 10)
        if (periodNum < 10 || periodNum > 300) {
          toast.error(t('credential-dialog.il-periodo-otp-deve-essere-compreso-tra-10-e-300'))
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
      password: activeCoreKeys.has(t('credential-dialog.password')) ? coreValues.password : '',
      url: activeCoreKeys.has('url') ? coreValues.url.trim() : '',
      category: categoryConfig.value,
      notes: activeCoreKeys.has('notes') ? coreValues.notes.trim() : '',
      fields: payloadFields,
      custom_fields: buildPayloadCustomFields(),
      favorite,
    }

    setSubmitting(true)
    try {
      const saved = editingCredential
        ? await vaultApi.updateCredential(editingCredential.id, payload)
        : await vaultApi.createCredential(payload)

      toast.success(
        editingCredential
          ? t('credential-dialog.credenziale-v0-aggiornata', { v0: saved.title })
          : t('credential-dialog.credenziale-v0-salvata', { v0: saved.title }),
      )
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('credential-dialog.errore-nel-salvataggio-credenziale'),
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
            <span>{t('credential-dialog.codice-otp-2fa-totp')}</span>
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
                {t('credential-dialog.parametri-avanzati')}</Button>
            )}
            {options?.allowCollapse && !trimmedTotp && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowOptionalOtp(false)}
              >
                {t('credential-dialog.rimuovi')}</Button>
            )}
          </div>
        </div>

        <div className="relative">
          <Input
            id="cred-field-totp"
            type={isRevealed ? 'text' : t('credential-dialog.password')}
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
            placeholder={t('credential-dialog.chiave-base32-es-jbswy3dpehpk3pxp-o-uri-otpauth-')}
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
                aria-label={t('credential-dialog.rimuovi-segreto-otp')}
                title={t('credential-dialog.rimuovi-segreto-otp')}
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
                isRevealed ? t('credential-dialog.nascondi-segreto-otp') : t('credential-dialog.mostra-segreto-otp')
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
                {t('credential-dialog.algoritmo')}</Label>
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
              <Label className="text-[11px] text-muted-foreground">{t('credential-dialog.cifre')}</Label>
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
                  <SelectItem value="6">{t('credential-dialog.6-cifre')}</SelectItem>
                  <SelectItem value="7">{t('credential-dialog.7-cifre')}</SelectItem>
                  <SelectItem value="8">{t('credential-dialog.8-cifre')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label
                htmlFor="cred-field-totp-period"
                className="text-[11px] text-muted-foreground"
              >
                {t('credential-dialog.periodo-s')}</Label>
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
              label={t('credential-dialog.anteprima-codice-otp')}
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
                      {t('credential-dialog.nascondi')}</>
                  ) : (
                    <>
                      <Eye className="size-3" />
                      {t('credential-dialog.mostra')}</>
                  )}
                </Button>
              )}

            {field.showGenerator && field.key === t('credential-dialog.password') && (
              <Popover open={genOpen} onOpenChange={setGenOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="xs">
                    <Sparkles className="size-3.5" />
                    {t('credential-dialog.genera')}</Button>
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
              <SelectItem value={EMPTY_SELECT_VALUE}>{t('credential-dialog.nessuno')}</SelectItem>
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
                {t('credential-dialog.mostra-modifica')}</Button>
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
              type={isRevealed ? 'text' : t('credential-dialog.password')}
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
              aria-label={isRevealed ? t('credential-dialog.nascondi-valore') : t('credential-dialog.mostra-valore')}
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

        {field.showStrength && field.key === t('credential-dialog.password') && value && (
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
            {editingCredential ? t('credential-dialog.modifica-credenziale') : t('credential-dialog.nuova-credenziale')}
          </DialogTitle>
          <DialogDescription>
            {t('credential-dialog.tutti-i-campi-sensibili-vengono-cifrati-con-aes-')}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('credential-dialog.cartella')}</Label>
                <Select value={vaultId} onValueChange={setVaultId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('credential-dialog.seleziona-cartella')} />
                  </SelectTrigger>
                  <SelectContent>
                    {writableVaults.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                        {v.owner_group_name
                          ? ` (${v.owner_group_name})`
                          : v.is_shared_with_me
                            ? t('credential-dialog.condivisa')
                            : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('credential-dialog.tipologia')}</Label>
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
              <Label htmlFor="cred-title">{t('credential-dialog.titolo')}</Label>
              <Input
                id="cred-title"
                placeholder={t('credential-dialog.es-aws-console-github-passkey-identita-mario-ros')}
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
                    {t('credential-dialog.aggiungi-codice-otp-2fa-totp')}</Button>
                ))}

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cred-tags">{t('credential-dialog.tag-separati-da-virgola')}</Label>
                  <Input
                    id="cred-tags"
                    placeholder={t('credential-dialog.es-personale-produttivita-cloud')}
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
                    {t('credential-dialog.aggiungi-ai-preferiti')}</span>
                  <Switch checked={favorite} onCheckedChange={setFavorite} />
                </label>
              </div>
            </div>

            {/* Campi personalizzati */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-muted-foreground">
                  Campi personalizzati
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={openAddFieldDialog}
                >
                  <Plus className="size-3" />
                  Aggiungi campo
                </Button>
              </div>

              {customFields.map((field, idx) => {
                const revealKey = `cf-${idx}`
                const isRevealed = Boolean(revealedFields[revealKey])
                return (
                  <div
                    key={idx}
                    className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Select
                        value={field.field_type}
                        onValueChange={(v) =>
                          changeCustomFieldType(idx, v as CustomFieldType)
                        }
                      >
                        <SelectTrigger className="h-9 w-44 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CUSTOM_FIELD_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        value={field.label}
                        placeholder="Etichetta campo"
                        onChange={(e) =>
                          updateCustomField(idx, { label: e.target.value })
                        }
                        className="h-9 flex-1"
                      />

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeCustomField(idx)}
                        className="shrink-0 text-muted-foreground"
                        tabIndex={-1}
                        aria-label={`Rimuovi campo ${field.label || idx + 1}`}
                        title="Rimuovi campo"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>

                    {field.field_type === 'checkbox' ? (
                      <label className="flex cursor-pointer items-center justify-between rounded-md border border-border/60 bg-background/60 px-3 py-2">
                        <span className="text-xs text-muted-foreground">
                          {field.value === 'true' ? t('credential-dialog.si') : t('credential-dialog.no')}
                        </span>
                        <Switch
                          checked={field.value === 'true'}
                          onCheckedChange={(checked) =>
                            updateCustomField(idx, {
                              value: checked ? 'true' : 'false',
                            })
                          }
                        />
                      </label>
                    ) : field.field_type === 'linked' ? (
                      <Select
                        value={String(field.linked_id ?? LINKED_ID_USERNAME)}
                        onValueChange={(v) =>
                          updateCustomField(idx, {
                            linked_id: Number.parseInt(v, 10),
                          })
                        }
                      >
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LINKED_FIELD_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="relative">
                        <Input
                          type={
                            field.field_type === 'hidden' && !isRevealed
                              ? 'password'
                              : 'text'
                          }
                          value={field.value}
                          placeholder={
                            field.field_type === 'hidden'
                              ? 'Valore nascosto'
                              : 'Valore'
                          }
                          onChange={(e) =>
                            updateCustomField(idx, { value: e.target.value })
                          }
                          className={cn(
                            'h-9',
                            field.field_type === 'hidden' && 'pr-10',
                          )}
                        />
                        {field.field_type === 'hidden' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => toggleReveal(revealKey)}
                            className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
                            tabIndex={-1}
                            aria-label={
                              isRevealed ? 'Nascondi valore' : 'Mostra valore'
                            }
                          >
                            {isRevealed ? (
                              <EyeOff className="size-3.5" />
                            ) : (
                              <Eye className="size-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <DialogFooter className="border-t pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('credential-dialog.annulla')}</Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Salvataggio...'
                : editingCredential
                  ? t('credential-dialog.salva-modifiche')
                  : t('credential-dialog.salva-credenziale')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <Dialog open={addFieldOpen} onOpenChange={setAddFieldOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi campo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo campo</Label>
              <Select
                value={addFieldType}
                onValueChange={(v) => setAddFieldType(v as CustomFieldType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_FIELD_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {getCustomFieldTypeOption(addFieldType).description}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-custom-field-label">
                Etichetta campo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-custom-field-label"
                value={addFieldLabel}
                onChange={(e) => setAddFieldLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    confirmAddField()
                  }
                }}
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="justify-start gap-2">
            <Button
              type="button"
              disabled={!addFieldLabel.trim()}
              onClick={confirmAddField}
            >
              Aggiungi
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddFieldOpen(false)}
            >
              {t('credential-dialog.annulla')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
