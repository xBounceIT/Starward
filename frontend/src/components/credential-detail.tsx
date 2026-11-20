import { useEffect, useState } from 'react'
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Folder,
  Lock,
  Pencil,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { CategoryIcon } from '@/components/vault-icon'
import type { Credential } from '@/lib/api'
import {
  getCategoryConfig,
  getCategoryLabel,
  getSelectOptionLabel,
  maskSecretValue,
  type CredentialFieldDef,
} from '@/lib/credential-types'
import { cn } from '@/lib/utils'
import {
  evaluatePasswordStrength,
  formatRelativeDate,
  getVaultColor,
} from '@/lib/vault-utils'

interface CredentialDetailProps {
  credential: Credential | null
  onEdit: (cred: Credential) => void
  onDelete: (cred: Credential) => void
  onToggleFavorite: (cred: Credential) => void
  onSelectVault: (vaultId: string) => void
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

export function CredentialDetail({
  credential,
  onEdit,
  onDelete,
  onToggleFavorite,
  onSelectVault,
}: CredentialDetailProps) {
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>(
    {},
  )
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    setRevealedFields({})
    setCopiedField(null)
  }, [credential?.id])

  if (!credential) {
    return (
      <section className="hidden flex-1 flex-col items-center justify-center bg-muted/20 p-8 text-center lg:flex">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <ShieldCheck className="size-8" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">
          Seleziona una credenziale
        </h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Scegli una voce dalla lista per visualizzare i dettagli, copiare i
          segreti con un clic o modificarla.
        </p>
      </section>
    )
  }

  const canWrite =
    credential.vault_role === 'owner' || credential.vault_role === 'editor'
  const categoryConfig = getCategoryConfig(credential.category)
  const vaultPalette = getVaultColor(credential.vault_color)
  const strength = evaluatePasswordStrength(credential.password)
  const extraFields = credential.fields ?? {}

  const toggleReveal = (key: string) => {
    setRevealedFields((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const copyField = async (field: string, value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      toast.success(`${label} copiato negli appunti`)
      setTimeout(() => setCopiedField(null), 1800)
    } catch {
      toast.error('Impossibile copiare negli appunti')
    }
  }

  const urlFieldDef = categoryConfig.fields.find((f) => f.key === 'url')
  const showHeaderLink = Boolean(urlFieldDef?.isLink && credential.url)
  const normalizedUrl = credential.url
    ? /^https?:\/\//i.test(credential.url)
      ? credential.url
      : `https://${credential.url}`
    : ''

  const mainFieldDefs =
    categoryConfig.value === 'note'
      ? categoryConfig.fields
      : categoryConfig.fields.filter((f) => f.key !== 'notes')

  const visibleMainFields = mainFieldDefs.filter((field) => {
    const val =
      field.storage === 'core'
        ? getCoreValue(credential, field.key)
        : (extraFields[field.key] ?? '')
    if (val) return true
    if (categoryConfig.value === 'login' && field.key === 'username') {
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
        label: 'Username / Email',
        placeholder: '',
        type: 'text',
      },
      {
        key: 'password',
        storage: 'core',
        label: 'Password / Segreto',
        placeholder: '',
        type: 'password',
        mono: true,
        secret: true,
      },
      {
        key: 'url',
        storage: 'core',
        label: 'URL / Endpoint',
        placeholder: '',
        type: 'url',
        isLink: true,
      },
    ] as CredentialFieldDef[]
  ).filter(
    (f) => !configuredCoreKeys.has(f.key) && Boolean(getCoreValue(credential, f.key)),
  )

  const renderFieldRow = (field: CredentialFieldDef) => {
    const rawValue =
      field.storage === 'core'
        ? getCoreValue(credential, field.key)
        : (extraFields[field.key] ?? '')

    const displayValue =
      field.type === 'select' && rawValue
        ? getSelectOptionLabel(field, rawValue)
        : rawValue

    const isRevealed = Boolean(revealedFields[field.key])
    const isMultiline =
      field.type === 'textarea' || field.type === 'secret-textarea'

    const externalHref =
      field.isLink && rawValue
        ? /^https?:\/\//i.test(rawValue)
          ? rawValue
          : `https://${rawValue}`
        : null

    return (
      <div key={field.key} className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              {field.label}
            </p>

            {!rawValue ? (
              <p className="mt-1 text-sm italic text-muted-foreground">
                Non specificato
              </p>
            ) : field.secret && !isRevealed ? (
              <p className="mt-1 font-mono text-sm font-medium break-all select-none">
                {field.type === 'secret-textarea'
                  ? '••••••••••••••••••••••••••••••••\n••••••••••••••••••••••••••••••••'
                  : maskSecretValue(rawValue, field.maskMode)}
              </p>
            ) : isMultiline ? (
              <p
                className={cn(
                  'mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed select-all',
                  field.mono && 'font-mono text-xs',
                )}
              >
                {displayValue}
              </p>
            ) : (
              <p
                className={cn(
                  'mt-1 text-sm font-medium break-all select-all',
                  field.mono && 'font-mono',
                )}
              >
                {displayValue}
              </p>
            )}
          </div>

          {rawValue && (
            <div className="flex shrink-0 items-center gap-1.5">
              {field.secret && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => toggleReveal(field.key)}
                  title={isRevealed ? 'Nascondi' : 'Mostra'}
                >
                  {isRevealed ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>
              )}

              <Button
                type="button"
                variant={field.key === 'password' ? 'default' : 'secondary'}
                size="sm"
                onClick={() => copyField(field.key, rawValue, field.label)}
              >
                {copiedField === field.key ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {categoryConfig.value === 'note' && field.key === 'notes'
                  ? 'Copia nota'
                  : 'Copia'}
              </Button>

              {externalHref && (
                <Button variant="outline" size="icon-sm" asChild>
                  <a
                    href={externalHref}
                    target="_blank"
                    rel="noreferrer"
                    title="Apri URL"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>

        {field.showStrength && field.key === 'password' && rawValue && (
          <div className="flex items-center gap-2.5">
            <Progress value={strength.percent} className="h-1.5 flex-1" />
            <span className="text-[11px] font-medium text-muted-foreground">
              Sicurezza: {strength.label}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-background">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelectVault(credential.vault_id)}
            className="h-7 gap-1.5 px-2.5 text-xs"
          >
            <Folder className={cn('size-3.5', vaultPalette.text)} />
            <span className="max-w-44 truncate">{credential.vault_name}</span>
          </Button>
          <Badge variant="outline" className="text-xs">
            {getCategoryLabel(credential.category)}
          </Badge>
          {!canWrite && (
            <Badge variant="secondary" className="text-xs">
              Sola lettura
            </Badge>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {canWrite && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
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
                variant="outline"
                size="sm"
                onClick={() => onEdit(credential)}
              >
                <Pencil className="size-3.5" />
                Modifica
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(credential)}
                title="Elimina credenziale"
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl space-y-6 p-6">
          {/* Header block */}
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'flex size-14 shrink-0 items-center justify-center rounded-2xl',
                vaultPalette.bg,
                vaultPalette.text,
              )}
            >
              <CategoryIcon
                category={credential.category}
                className="size-7"
              />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-bold tracking-tight">
                {credential.title}
              </h2>
              {showHeaderLink ? (
                <a
                  href={normalizedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <span className="max-w-md truncate">{credential.url}</span>
                  <ExternalLink className="size-3.5 shrink-0" />
                </a>
              ) : (
                credential.url &&
                urlFieldDef && (
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {credential.url}
                  </p>
                )
              )}
            </div>
          </div>

          {/* Primary Fields Card */}
          <Card className="gap-0 overflow-hidden py-0">
            <CardContent className="divide-y p-0">
              {visibleMainFields.map(renderFieldRow)}
              {legacyCoreFallbacks.map(renderFieldRow)}
            </CardContent>
          </Card>

          {/* Separate Notes Card for non-note categories */}
          {categoryConfig.value !== 'note' && credential.notes && (
            <Card className="gap-2 py-4">
              <CardContent className="space-y-2 px-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Note cifrate
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      copyField('notes', credential.notes, 'Note')
                    }
                  >
                    {copiedField === 'notes' ? (
                      <Check className="size-3" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    Copia
                  </Button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {credential.notes}
                </p>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Metadata Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="space-y-0.5">
              <p>
                Aggiornata{' '}
                <strong className="text-foreground">
                  {formatRelativeDate(credential.updated_at)}
                </strong>{' '}
                da {credential.updated_by_name}
              </p>
              <p>
                Creata{' '}
                <span>{formatRelativeDate(credential.created_at)}</span> da{' '}
                {credential.created_by_name}
              </p>
            </div>
            <Badge variant="secondary" className="gap-1.5 px-2.5 py-1">
              <Lock className="size-3" />
              Cifrata AES-256-GCM
            </Badge>
          </div>
        </div>
      </ScrollArea>
    </section>
  )
}
