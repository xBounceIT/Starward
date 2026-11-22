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
  pools.forEach((pool, idx) => {
    if (idx < length) {
      chars.push(pool[randomValues[idx] % pool.length])
    }
  })

  for (let i = chars.length; i < length; i++) {
    chars.push(all[randomValues[i] % all.length])
  }

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
    return {
      score: 1,
      label: 'Debole',
      colorClass: 'bg-destructive',
      percent: 25,
    }
  }
  if (points <= 3) {
    return {
      score: 2,
      label: 'Discreta',
      colorClass: 'bg-amber-500',
      percent: 50,
    }
  }
  if (points <= 4) {
    return {
      score: 3,
      label: 'Forte',
      colorClass: 'bg-emerald-500',
      percent: 75,
    }
  }
  return {
    score: 4,
    label: 'Eccellente',
    colorClass: 'bg-primary',
    percent: 100,
  }
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

const RELATIVE_DATE_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const TIME_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  hour: '2-digit',
  minute: '2-digit',
})

const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000

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
    return RELATIVE_DATE_FORMATTER.format(date)
  } catch {
    return iso
  }
}

export function formatModifiedRelative(iso: string): string {
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''

    const now = new Date()
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime()
    const startOfTarget = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ).getTime()

    const diffDays = Math.max(
      0,
      Math.round((startOfToday - startOfTarget) / 86400000),
    )

    if (diffDays === 0) return 'Modificata oggi'
    if (diffDays === 1) return 'Modificata ieri'
    if (diffDays < 7) return `Modificata ${diffDays} giorni fa`

    const diffWeeks = Math.floor(diffDays / 7)
    if (diffWeeks === 1) return 'Modificata 1 settimana fa'
    if (diffWeeks < 5) return `Modificata ${diffWeeks} settimane fa`

    const diffMonths = Math.max(1, Math.floor(diffDays / 30))
    if (diffMonths === 1) return 'Modificata 1 mese fa'
    if (diffMonths < 12) return `Modificata ${diffMonths} mesi fa`

    return `Modificata il ${formatShortDate(iso)}`
  } catch {
    return ''
  }
}

export function formatShortDate(iso?: string | null): string {
  if (!iso) return '—'
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '—'
    return SHORT_DATE_FORMATTER.format(date).replace('.', '')
  } catch {
    return '—'
  }
}

export function formatAccessTimestamp(iso?: string | null): string {
  if (!iso) return '—'
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '—'

    const now = new Date()
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const isYesterday =
      date.getFullYear() === yesterday.getFullYear() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getDate() === yesterday.getDate()

    const timeStr = TIME_FORMATTER.format(date)

    if (isToday) return `Oggi, ${timeStr}`
    if (isYesterday) return `Ieri, ${timeStr}`
    return `${formatShortDate(iso)}, ${timeStr}`
  } catch {
    return '—'
  }
}

export function isRecentlyAdded(iso: string, withinDays = 7): boolean {
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return false
    const diffMs = Date.now() - date.getTime()
    return (
      diffMs >= -CLOCK_SKEW_TOLERANCE_MS && diffMs <= withinDays * 86400000
    )
  } catch {
    return false
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
