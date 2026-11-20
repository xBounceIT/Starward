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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { CategoryIcon } from '@/components/vault-icon'
import type { Credential } from '@/lib/api'
import {
  cn,
  evaluatePasswordStrength,
  formatRelativeDate,
  getCategoryLabel,
  getVaultColor,
} from '@/lib/utils'

interface CredentialDetailProps {
  credential: Credential | null
  onEdit: (cred: Credential) => void
  onDelete: (cred: Credential) => void
  onToggleFavorite: (cred: Credential) => void
  onSelectVault: (vaultId: string) => void
}

export function CredentialDetail({
  credential,
  onEdit,
  onDelete,
  onToggleFavorite,
  onSelectVault,
}: CredentialDetailProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    setShowPassword(false)
    setCopiedField(null)
  }, [credential?.id])

  if (!credential) {
    return (
      <main className="hidden flex-1 flex-col items-center justify-center bg-muted/20 p-8 text-center lg:flex">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="size-8" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">
          Seleziona una credenziale
        </h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Scegli una voce dalla lista per visualizzare i dettagli, copiare la
          password con un clic o modificarla.
        </p>
      </main>
    )
  }

  const canWrite =
    credential.vault_role === 'owner' || credential.vault_role === 'editor'
  const strength = evaluatePasswordStrength(credential.password)
  const vaultPalette = getVaultColor(credential.vault_color)

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

  const normalizedUrl = credential.url
    ? /^https?:\/\//i.test(credential.url)
      ? credential.url
      : `https://${credential.url}`
    : ''

  return (
    <main className="flex flex-1 flex-col bg-background min-w-0">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b px-6 py-3.5">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => onSelectVault(credential.vault_id)}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors cursor-pointer"
          >
            <Folder className={cn('size-3.5', vaultPalette.text)} />
            <span className="truncate max-w-44">{credential.vault_name}</span>
          </button>
          <Badge variant="outline" className="text-xs">
            {getCategoryLabel(credential.category)}
          </Badge>
          {!canWrite && (
            <Badge variant="secondary" className="text-xs">
              Sola lettura
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
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
              <CategoryIcon category={credential.category} className="size-7" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-bold tracking-tight">
                {credential.title}
              </h2>
              {credential.url && (
                <a
                  href={normalizedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <span className="truncate max-w-md">{credential.url}</span>
                  <ExternalLink className="size-3.5 shrink-0" />
                </a>
              )}
            </div>
          </div>

          {/* Fields Card */}
          <div className="divide-y rounded-xl border bg-card shadow-xs">
            {/* Username */}
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Username / Email
                </p>
                <p className="mt-1 truncate text-sm font-medium select-all">
                  {credential.username || (
                    <span className="italic text-muted-foreground">
                      Non specificato
                    </span>
                  )}
                </p>
              </div>
              {credential.username && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    copyField('username', credential.username, 'Username')
                  }
                >
                  {copiedField === 'username' ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  Copia
                </Button>
              )}
            </div>

            {/* Password */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Password / Segreto
                  </p>
                  <p className="mt-1 font-mono text-sm font-medium break-all select-all">
                    {showPassword
                      ? credential.password
                      : '•'.repeat(Math.min(20, Math.max(10, credential.password.length)))}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setShowPassword((s) => !s)}
                    title={showPassword ? 'Nascondi' : 'Mostra'}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() =>
                      copyField('password', credential.password, 'Password')
                    }
                  >
                    {copiedField === 'password' ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    Copia
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${strength.colorClass}`}
                    style={{ width: `${strength.percent}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">
                  Sicurezza: {strength.label}
                </span>
              </div>
            </div>

            {/* URL */}
            {credential.url && (
              <div className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Sito Web / Endpoint
                  </p>
                  <p className="mt-1 truncate text-sm font-medium">
                    {credential.url}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyField('url', credential.url, 'URL')}
                  >
                    {copiedField === 'url' ? (
                      <Check className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    Copia
                  </Button>
                  <Button variant="outline" size="icon-sm" asChild>
                    <a
                      href={normalizedUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Apri URL"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {credential.notes && (
            <div className="rounded-xl border bg-card p-4 shadow-xs">
              <p className="text-xs font-medium text-muted-foreground">
                Note cifrate
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {credential.notes}
              </p>
            </div>
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
            <Badge variant="success" className="gap-1.5 py-1 px-2.5">
              <Lock className="size-3" />
              Cifrata AES-256-GCM
            </Badge>
          </div>
        </div>
      </ScrollArea>
    </main>
  )
}
