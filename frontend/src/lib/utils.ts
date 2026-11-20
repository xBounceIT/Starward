import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface PasswordOptions {
  length: number
  uppercase: boolean
  lowercase: boolean
  numbers: boolean
  symbols: boolean
}

export function generateSecurePassword(options: PasswordOptions): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const nums = '23456789'
  const syms = '!@#$%^&*()-_=+[]{}?'

  const pools: string[] = []
  if (options.uppercase) pools.push(upper)
  if (options.lowercase) pools.push(lower)
  if (options.numbers) pools.push(nums)
  if (options.symbols) pools.push(syms)

  if (pools.length === 0) {
    pools.push(lower, nums)
  }

  const all = pools.join('')
  const length = Math.max(8, Math.min(64, options.length))
  const randomValues = new Uint32Array(length)
  crypto.getRandomValues(randomValues)

  const chars: string[] = []
  // Guarantee at least one char from each selected pool
  pools.forEach((pool, idx) => {
    if (idx < length) {
      chars.push(pool[randomValues[idx] % pool.length])
    }
  })

  for (let i = chars.length; i < length; i++) {
    chars.push(all[randomValues[i] % all.length])
  }

  // Fisher-Yates shuffle
  const shuffleValues = new Uint32Array(chars.length)
  crypto.getRandomValues(shuffleValues)
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffleValues[i] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  colorClass: string
  percent: number
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: 'Vuota', colorClass: 'bg-muted', percent: 0 }
  }

  let points = 0
  if (password.length >= 8) points++
  if (password.length >= 12) points++
  if (password.length >= 16) points++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points++
  if (/\d/.test(password)) points++
  if (/[^a-zA-Z0-9]/.test(password)) points++

  if (points <= 2) {
    return { score: 1, label: 'Debole', colorClass: 'bg-red-500', percent: 25 }
  }
  if (points <= 3) {
    return { score: 2, label: 'Discreta', colorClass: 'bg-amber-500', percent: 50 }
  }
  if (points <= 4) {
    return { score: 3, label: 'Forte', colorClass: 'bg-emerald-500', percent: 75 }
  }
  return { score: 4, label: 'Eccellente', colorClass: 'bg-indigo-500', percent: 100 }
}

export function getInitials(nameOrEmail?: string | null): string {
  if (!nameOrEmail) return '?'
  const cleaned = nameOrEmail.trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return cleaned.slice(0, 2).toUpperCase()
}

export function formatRelativeDate(iso: string): string {
  try {
    const date = new Date(iso)
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'adesso'
    if (diffMin < 60) return `${diffMin} min fa`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours} ore fa`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}g fa`
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date)
  } catch {
    return iso
  }
}

export const VAULT_COLORS: Record<
  string,
  { label: string; bg: string; text: string; dot: string; ring: string }
> = {
  indigo: {
    label: 'Indaco',
    bg: 'bg-indigo-500/12',
    text: 'text-indigo-600 dark:text-indigo-400',
    dot: 'bg-indigo-500',
    ring: 'ring-indigo-500/30',
  },
  emerald: {
    label: 'Smeraldo',
    bg: 'bg-emerald-500/12',
    text: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-500/30',
  },
  amber: {
    label: 'Ambra',
    bg: 'bg-amber-500/12',
    text: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    ring: 'ring-amber-500/30',
  },
  rose: {
    label: 'Rosa',
    bg: 'bg-rose-500/12',
    text: 'text-rose-600 dark:text-rose-400',
    dot: 'bg-rose-500',
    ring: 'ring-rose-500/30',
  },
  sky: {
    label: 'Cielo',
    bg: 'bg-sky-500/12',
    text: 'text-sky-600 dark:text-sky-400',
    dot: 'bg-sky-500',
    ring: 'ring-sky-500/30',
  },
  violet: {
    label: 'Viola',
    bg: 'bg-violet-500/12',
    text: 'text-violet-600 dark:text-violet-400',
    dot: 'bg-violet-500',
    ring: 'ring-violet-500/30',
  },
}

export function getVaultColor(color: string) {
  return VAULT_COLORS[color] ?? VAULT_COLORS.indigo
}

export const CREDENTIAL_CATEGORIES = [
  { value: 'login', label: 'Login Web' },
  { value: 'api_key', label: 'API Key / Token' },
  { value: 'database', label: 'Database' },
  { value: 'ssh', label: 'SSH / Server' },
  { value: 'card', label: 'Carta / Licenza' },
  { value: 'note', label: 'Nota Sicura' },
] as const

export function getCategoryLabel(category: string): string {
  return (
    CREDENTIAL_CATEGORIES.find((c) => c.value === category)?.label ?? 'Login Web'
  )
}
