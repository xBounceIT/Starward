import {
  Building2,
  Code2,
  CreditCard,
  Database,
  FileText,
  Folder,
  Globe,
  KeyRound,
  KeySquare,
  Lock,
  Server,
  Shield,
  Terminal,
  Users,
} from 'lucide-react'
import type { Credential } from '@/lib/api'
import { cn } from '@/lib/utils'
import { getVaultColor } from '@/lib/vault-utils'

export const VAULT_ICON_OPTIONS = [
  { value: 'folder', label: 'Cartella' },
  { value: 'lock', label: 'Privata' },
  { value: 'users', label: 'Team' },
  { value: 'shield', label: 'Sicurezza' },
  { value: 'server', label: 'Server' },
  { value: 'globe', label: 'Web' },
  { value: 'key', label: 'Chiavi' },
  { value: 'building', label: 'Azienda' },
] as const

export function VaultIcon({
  icon,
  className = 'size-4',
}: {
  icon: string
  className?: string
}) {
  switch (icon) {
    case 'lock':
      return <Lock className={className} />
    case 'users':
      return <Users className={className} />
    case 'shield':
      return <Shield className={className} />
    case 'server':
      return <Server className={className} />
    case 'globe':
      return <Globe className={className} />
    case 'key':
      return <KeyRound className={className} />
    case 'building':
      return <Building2 className={className} />
    default:
      return <Folder className={className} />
  }
}

export function CategoryIcon({
  category,
  className = 'size-4',
}: {
  category: string
  className?: string
}) {
  switch (category) {
    case 'api_key':
      return <Code2 className={className} />
    case 'database':
      return <Database className={className} />
    case 'ssh':
      return <Terminal className={className} />
    case 'card':
      return <CreditCard className={className} />
    case 'license':
      return <KeySquare className={className} />
    case 'note':
      return <FileText className={className} />
    default:
      return <Globe className={className} />
  }
}

type BrandKey =
  | 'google'
  | 'github'
  | 'notion'
  | 'aws'
  | 'stripe'
  | 'openai'
  | 'gitlab'
  | 'cloudflare'
  | 'vercel'
  | 'discord'
  | 'slack'

function detectBrand(cred: Pick<Credential, 'title' | 'url' | 'fields'>): BrandKey | null {
  const hay = `${cred.title} ${cred.url} ${cred.fields?.provider ?? ''}`.toLowerCase()
  if (hay.includes('google') || hay.includes('gmail') || hay.includes('youtube'))
    return 'google'
  if (hay.includes('github')) return 'github'
  if (hay.includes('notion')) return 'notion'
  if (hay.includes('aws') || hay.includes('amazon')) return 'aws'
  if (hay.includes('stripe')) return 'stripe'
  if (hay.includes('openai') || hay.includes('chatgpt')) return 'openai'
  if (hay.includes('gitlab')) return 'gitlab'
  if (hay.includes('cloudflare')) return 'cloudflare'
  if (hay.includes('vercel')) return 'vercel'
  if (hay.includes('discord')) return 'discord'
  if (hay.includes('slack')) return 'slack'
  return null
}

export function CredentialBrandIcon({
  credential,
  className = 'size-10 rounded-xl',
  iconClassName = 'size-5',
}: {
  credential: Pick<
    Credential,
    'title' | 'url' | 'category' | 'vault_color' | 'fields'
  >
  className?: string
  iconClassName?: string
}) {
  const brand = detectBrand(credential)

  if (brand === 'google') {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center bg-white shadow-xs ring-1 ring-black/5',
          className,
        )}
      >
        <svg viewBox="0 0 24 24" className={iconClassName} aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
      </div>
    )
  }

  if (brand === 'github') {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center border border-white/10 bg-zinc-900 text-white',
          className,
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={iconClassName}
          aria-hidden="true"
        >
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.92.58.1.79-.25.79-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.02 11.02 0 0 1 5.78 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
        </svg>
      </div>
    )
  }

  if (brand === 'notion') {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center border border-white/10 bg-zinc-900 text-white',
          className,
        )}
      >
        <div className="flex size-6 items-center justify-center rounded-sm border border-white/70 font-serif text-xs font-bold leading-none">
          N
        </div>
      </div>
    )
  }

  if (brand === 'aws') {
    return (
      <div
        className={cn(
          'flex shrink-0 flex-col items-center justify-center border border-white/10 bg-zinc-900 text-white',
          className,
        )}
      >
        <span className="font-sans text-[11px] font-extrabold leading-none tracking-tight text-white">
          aws
        </span>
        <span className="mt-0.5 h-0.5 w-5 rounded-full bg-amber-500" />
      </div>
    )
  }

  if (brand === 'stripe') {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center bg-[#635bff] text-white shadow-xs',
          className,
        )}
      >
        <span className="font-sans text-base font-black leading-none">S</span>
      </div>
    )
  }

  if (brand === 'openai') {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center border border-white/10 bg-zinc-900 text-white',
          className,
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className={iconClassName}
          aria-hidden="true"
        >
          <path d="M12 3a4.5 4.5 0 0 0-4.24 3.01A4.5 4.5 0 0 0 4.5 12.5a4.5 4.5 0 0 0 3.26 6.49A4.5 4.5 0 0 0 15.5 18a4.5 4.5 0 0 0 4-6.5 4.5 4.5 0 0 0-3.26-6.49A4.5 4.5 0 0 0 12 3Z" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      </div>
    )
  }

  if (brand === 'gitlab') {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center border border-orange-500/25 bg-orange-500/15 text-orange-400',
          className,
        )}
      >
        <span className="text-xs font-extrabold">GL</span>
      </div>
    )
  }

  if (brand === 'cloudflare') {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center border border-amber-500/25 bg-amber-500/15 text-amber-400',
          className,
        )}
      >
        <span className="text-xs font-extrabold">CF</span>
      </div>
    )
  }

  if (brand === 'vercel') {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center border border-white/10 bg-zinc-900 text-white',
          className,
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="size-4"
          aria-hidden="true"
        >
          <path d="M12 3 22 20H2L12 3Z" />
        </svg>
      </div>
    )
  }

  // Category-styled icon fallback matching the screenshot
  switch (credential.category) {
    case 'database':
      return (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center border border-sky-500/25 bg-sky-500/15 text-sky-400',
            className,
          )}
        >
          <Database className={iconClassName} />
        </div>
      )
    case 'ssh':
      return (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center border border-white/10 bg-zinc-800/90 text-zinc-200',
            className,
          )}
        >
          <Terminal className={iconClassName} />
        </div>
      )
    case 'api_key':
      return (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center border border-violet-500/25 bg-violet-500/15 text-violet-400',
            className,
          )}
        >
          <Code2 className={iconClassName} />
        </div>
      )
    case 'card':
      return (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center border border-emerald-500/25 bg-emerald-500/15 text-emerald-400',
            className,
          )}
        >
          <CreditCard className={iconClassName} />
        </div>
      )
    case 'license':
      return (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center border border-amber-500/25 bg-amber-500/15 text-amber-400',
            className,
          )}
        >
          <KeySquare className={iconClassName} />
        </div>
      )
    case 'note':
      return (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center border border-rose-500/25 bg-rose-500/15 text-rose-400',
            className,
          )}
        >
          <FileText className={iconClassName} />
        </div>
      )
    default: {
      const vaultPalette = getVaultColor(credential.vault_color)
      return (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center border border-white/10',
            vaultPalette.bg,
            vaultPalette.text,
            className,
          )}
        >
          <Globe className={iconClassName} />
        </div>
      )
    }
  }
}
