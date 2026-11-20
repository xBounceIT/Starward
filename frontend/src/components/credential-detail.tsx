import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Folder,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CredentialBrandIcon } from '@/components/vault-icon'
import type { Credential } from '@/lib/api'
import {
  getCategoryConfig,
  getCategoryLabel,
  getCredentialQuickCopy,
  getSelectOptionLabel,
  maskSecretValue,
  parseCredentialTags,
  type CredentialFieldDef,
} from '@/lib/credential-types'
import { cn } from '@/lib/utils'
import {
  formatAccessTimestamp,
  formatShortDate,
  getVaultColor,
} from '@/lib/vault-utils'

interface CredentialDetailProps {
  credential: Credential | null
  lastAccessedAt?: string
  onEdit: (cred: Credential) => void
  onDelete: (cred: Credential) => void
  onToggleFavorite: (cred: Credential) => void
  onUpdateTags: (cred: Credential, nextTags: string[]) => void
  onSelectVault: (vaultId: string) => void
  onClose?: () => void
}

function getCoreValue(cred: Credential, key: string): string {
  switch (key) {
    case 'username':
      return cred.username
    case 'password':
      return cred.password
    case 'url':
      return cred.url
    case 'notes':
      return cred.notes
    default:
      return ''
  }
}

function getDetailFieldLabel(category: string, field: CredentialFieldDef): string {
  if (category === 'login') {
    if (field.key === 'username') return 'Username'
    if (field.key === 'password') return 'Password'
    if (field.key === 'url') return 'URL'
    if (field.key === 'notes') return 'Note'
  }
  if (field.key === 'notes') return 'Note'
  return field.label
}

export function CredentialDetail({
  credential,
  lastAccessedAt,
  onEdit,
  onDelete,
  onToggleFavorite,
  onUpdateTags,
  onSelectVault,
  onClose,
}: CredentialDetailProps) {
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>(
    {},
  )
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [addingTag, setAddingTag] = useState(false)
  const [newTagValue, setNewTagValue] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setRevealedFields({})
    setCopiedField(null)
    setAddingTag(false)
    setNewTagValue('')
  }, [credential?.id])

  useEffect(() => {
    if (addingTag) {
      tagInputRef.current?.focus()
    }
  }, [addingTag])

  if (!credential) {
    return (
      <section className="hidden h-full w-full flex-col border-l border-border/80 bg-card/20 lg:flex lg:w-[390px] lg:shrink-0 xl:w-[430px]">
        {onClose && (
          <div className="flex justify-end px-5 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              title="Chiudi pannello"
              aria-label="Chiudi pannello"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-400">
            <ShieldCheck className="size-7" />
          </div>
          <h3 className="mt-4 text-base font-semibold">
            Seleziona una credenziale
          </h3>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Scegli una voce dalla lista per visualizzare i dettagli, copiare i
            segreti con un clic o modificarla.
          </p>
        </div>
      </section>
    )
  }

  const canWrite =
    credential.vault_role === 'owner' || credential.vault_role === 'editor'
  const categoryConfig = getCategoryConfig(credential.category)
  const vaultPalette = getVaultColor(credential.vault_color)
  const extraFields = credential.fields ?? {}
  const tags = parseCredentialTags(credential)
  const quickCopy = getCredentialQuickCopy(credential)

  const toggleReveal = (key: string) => {
    setRevealedFields((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const copyField = async (field: string, value: string, label: string) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      toast.success(`${label} copiato negli appunti`)
      setTimeout(() => setCopiedField(null), 1800)
    } catch {
      toast.error('Impossibile copiare negli appunti')
    }
  }

  const normalizedUrl = credential.url
    ? /^https?:\/\//i.test(credential.url)
      ? credential.url
      : `https://${credential.url}`
    : ''

  const mainFieldDefs = categoryConfig.fields.filter((f) => f.key !== 'notes')

  const visibleMainFields = mainFieldDefs.filter((field) => {
    const val =
      field.storage === 'core'
        ? getCoreValue(credential, field.key)
        : (extraFields[field.key] ?? '')
    if (val) return true
    if (
      categoryConfig.value === 'login' &&
      (field.key === 'username' ||
        field.key === 'password' ||
        field.key === 'url')
    ) {
      return true
    }
    return false
  })

  // Backwards compatibility for legacy items created before category-specific schemas
  const configuredCoreKeys = new Set(
    categoryConfig.fields
      .filter((f) => f.storage === 'core')
      .map((f) => f.key),
  )
  const legacyCoreFallbacks: CredentialFieldDef[] = (
    [
      {
        key: 'username',
        storage: 'core',
        label: 'Username',
        placeholder: '',
        type: 'text',
      },
      {
        key: 'password',
        storage: 'core',
        label: 'Password',
        placeholder: '',
        type: 'password',
        mono: true,
        secret: true,
      },
      {
        key: 'url',
        storage: 'core',
        label: 'URL',
        placeholder: '',
        type: 'url',
        isLink: true,
      },
    ] as CredentialFieldDef[]
  ).filter(
    (f) =>
      !configuredCoreKeys.has(f.key) &&
      Boolean(getCoreValue(credential, f.key)),
  )

  const handleCommitNewTag = () => {
    const cleaned = newTagValue.trim().toLowerCase()
    setAddingTag(false)
    setNewTagValue('')
    if (!cleaned) return
    if (tags.includes(cleaned)) return
    onUpdateTags(credential, [...tags, cleaned])
  }

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateTags(
      credential,
      tags.filter((t) => t !== tagToRemove),
    )
  }

  const renderFieldBox = (field: CredentialFieldDef) => {
    const rawValue =
      field.storage === 'core'
        ? getCoreValue(credential, field.key)
        : (extraFields[field.key] ?? '')

    const displayValue =
      field.type === 'select' && rawValue
        ? getSelectOptionLabel(field, rawValue)
        : rawValue

    const label = getDetailFieldLabel(credential.category, field)
    const isRevealed = Boolean(revealedFields[field.key])
    const isMultiline =
      field.type === 'textarea' || field.type === 'secret-textarea'

    const externalHref =
      (field.isLink || field.key === 'url') && rawValue
        ? /^https?:\/\//i.test(rawValue)
          ? rawValue
          : `https://${rawValue}`
        : null

    return (
      <div key={field.key} className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>

        <div
          className={cn(
            'flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/50 px-3.5 py-2.5',
            isMultiline && 'items-start',
          )}
        >
          <div className="min-w-0 flex-1">
            {!rawValue ? (
              <span className="text-xs italic text-muted-foreground">
                Non specificato
              </span>
            ) : field.secret && !isRevealed ? (
              <span className="block font-mono text-sm tracking-widest text-foreground select-none">
                {field.type === 'secret-textarea'
                  ? '••••••••••••••••••••••••'
                  : maskSecretValue(rawValue, field.maskMode)}
              </span>
            ) : externalHref ? (
              <div className="flex min-w-0 items-center gap-2">
                <Link2 className="size-3.5 shrink-0 text-violet-400" />
                <a
                  href={externalHref}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm text-violet-400 hover:underline"
                >
                  {displayValue}
                </a>
              </div>
            ) : isMultiline ? (
              <p
                className={cn(
                  'whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90 select-all',
                  field.mono && 'font-mono text-xs',
                )}
              >
                {displayValue}
              </p>
            ) : (
              <span
                className={cn(
                  'block truncate text-sm text-foreground select-all',
                  field.mono && 'font-mono',
                )}
              >
                {displayValue}
              </span>
            )}
          </div>

          {rawValue && (
            <div className="flex shrink-0 items-center gap-1">
              {field.secret && (
                <button
                  type="button"
                  onClick={() => toggleReveal(field.key)}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  title={isRevealed ? 'Nascondi' : 'Mostra'}
                >
                  {isRevealed ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </button>
              )}

              {externalHref && (
                <a
                  href={externalHref}
                  target="_blank"
                  rel="noreferrer"
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  title="Apri URL"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}

              <button
                type="button"
                onClick={() => copyField(field.key, rawValue, label)}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                title={`Copia ${label.toLowerCase()}`}
              >
                {copiedField === field.key ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="flex h-full w-full flex-col border-l border-border/80 bg-card/25 lg:w-[390px] lg:shrink-0 xl:w-[430px]">
      {/* Top Close bar & Header */}
      <div className="px-5 pt-3 pb-4">
        {onClose && (
          <div className="mb-1 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              title="Chiudi pannello"
              aria-label="Chiudi pannello"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <CredentialBrandIcon
              credential={credential}
              className="size-12 rounded-xl"
              iconClassName="size-6"
            />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold leading-tight tracking-tight">
                {credential.title}
              </h2>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="truncate text-xs text-muted-foreground">
                  {getCategoryLabel(credential.category)}
                </span>
                {!canWrite && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                    Sola lettura
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {canWrite && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-8 rounded-lg border-border/80 bg-card/60 hover:bg-card"
                  onClick={() => onToggleFavorite(credential)}
                  title={
                    credential.favorite
                      ? 'Rimuovi dai preferiti'
                      : 'Aggiungi ai preferiti'
                  }
                >
                  <Star
                    className={cn(
                      'size-4',
                      credential.favorite
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-muted-foreground',
                    )}
                  />
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg border-border/80 bg-card/60 px-3 text-xs font-medium hover:bg-card"
                  onClick={() => onEdit(credential)}
                >
                  <Pencil className="size-3.5" />
                  Modifica
                </Button>
              </>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-8 rounded-lg border-border/80 bg-card/60 hover:bg-card"
                  aria-label="Altre opzioni"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => onSelectVault(credential.vault_id)}
                >
                  <Folder className={cn('size-4', vaultPalette.text)} />
                  <span className="truncate">
                    Cartella: {credential.vault_name}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    copyField('title', credential.title, 'Titolo')
                  }
                >
                  <Copy className="size-4" />
                  Copia titolo
                </DropdownMenuItem>
                {canWrite && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(credential)}
                    >
                      <Trash2 className="size-4" />
                      Elimina credenziale
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Main Fields Content */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-5 pb-5">
          {/* Titolo Field */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Titolo</p>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/50 px-3.5 py-2.5">
              <span className="truncate text-sm text-foreground select-all">
                {credential.title}
              </span>
              <button
                type="button"
                onClick={() => copyField('title', credential.title, 'Titolo')}
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                title="Copia titolo"
              >
                {copiedField === 'title' ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Primary Category Fields */}
          {visibleMainFields.map(renderFieldBox)}
          {legacyCoreFallbacks.map(renderFieldBox)}

          {/* Note Field */}
          {(credential.notes || categoryConfig.value === 'login' || categoryConfig.value === 'note') && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Note
                </p>
                {credential.notes && (
                  <button
                    type="button"
                    onClick={() => copyField('notes', credential.notes, 'Note')}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {copiedField === 'notes' ? (
                      <Check className="size-3 text-emerald-400" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    Copia
                  </button>
                )}
              </div>
              <div className="rounded-xl border border-border/70 bg-card/50 px-3.5 py-2.5">
                {credential.notes ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                    {credential.notes}
                  </p>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    Nessuna nota
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tag Section */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Tag</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/80 bg-card/60 px-2.5 text-xs text-foreground/90"
                >
                  <span>{tag}</span>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={`Rimuovi tag ${tag}`}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              ))}

              {canWrite &&
                (addingTag ? (
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={newTagValue}
                    onChange={(e) => setNewTagValue(e.target.value)}
                    onBlur={handleCommitNewTag}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCommitNewTag()
                      } else if (e.key === 'Escape') {
                        setAddingTag(false)
                        setNewTagValue('')
                      }
                    }}
                    placeholder="Nuovo tag..."
                    className="h-7 w-28 rounded-lg border border-violet-500/60 bg-card px-2.5 text-xs text-foreground outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingTag(true)}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/70 bg-card/30 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-card/70 hover:text-foreground"
                  >
                    <Plus className="size-3" />
                    <span>Aggiungi tag</span>
                  </button>
                ))}
            </div>
          </div>

          {/* Dates & Access Metadata */}
          <div className="space-y-2.5 border-t border-border/60 pt-4 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Plus className="size-3.5 shrink-0" />
                <span>Creata</span>
              </div>
              <span className="font-medium text-foreground/90">
                {formatShortDate(credential.created_at)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Pencil className="size-3.5 shrink-0" />
                <span>Ultima modifica</span>
              </div>
              <span className="font-medium text-foreground/90">
                {formatShortDate(credential.updated_at)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-3.5 shrink-0" />
                <span>Ultimo accesso</span>
              </div>
              <span className="font-medium text-foreground/90">
                {formatAccessTimestamp(
                  lastAccessedAt || credential.updated_at,
                )}
              </span>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Bottom Action Bar */}
      <div className="flex items-center gap-2 border-t border-border/70 bg-card/30 px-5 py-3.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!quickCopy.primary && !credential.username}
          onClick={() => {
            const val = quickCopy.primary?.value || credential.username
            const lbl = quickCopy.primary?.label || 'Username'
            if (val) copyField('quick-primary', val, lbl)
          }}
          className="h-9 flex-1 gap-1.5 rounded-xl border-border/80 bg-card/70 px-2.5 text-xs font-medium hover:bg-card"
        >
          <Copy className="size-3.5 shrink-0" />
          <span className="truncate">
            Copia {quickCopy.primary?.label.toLowerCase() ?? 'username'}
          </span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!quickCopy.secondary && !credential.password}
          onClick={() => {
            const val = quickCopy.secondary?.value || credential.password
            const lbl = quickCopy.secondary?.label || 'Password'
            if (val) copyField('quick-secondary', val, lbl)
          }}
          className="h-9 flex-1 gap-1.5 rounded-xl border-border/80 bg-card/70 px-2.5 text-xs font-medium hover:bg-card"
        >
          <Copy className="size-3.5 shrink-0" />
          <span className="truncate">
            Copia {quickCopy.secondary?.label.toLowerCase() ?? 'password'}
          </span>
        </Button>

        {normalizedUrl ? (
          <a
            href={normalizedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-violet-400 px-3.5 text-xs font-semibold text-zinc-950 shadow-xs transition-colors hover:bg-violet-300"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            <span>Apri URL</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-violet-400/40 px-3.5 text-xs font-semibold text-zinc-950/60 opacity-50"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            <span>Apri URL</span>
          </button>
        )}
      </div>
    </section>
  )
}
