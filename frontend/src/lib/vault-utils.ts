import type { CSSProperties } from 'react'

import i18n, { t } from '@/lib/i18n'

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
    return { score: 0, label: t('vault-utils.strength-empty'), colorClass: 'bg-muted', percent: 0 }
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
      label: t('vault-utils.strength-weak'),
      colorClass: 'bg-destructive',
      percent: 25,
    }
  }
  if (points <= 3) {
    return {
      score: 2,
      label: t('vault-utils.strength-fair'),
      colorClass: 'bg-amber-500',
      percent: 50,
    }
  }
  if (points <= 4) {
    return {
      score: 3,
      label: t('vault-utils.strength-strong'),
      colorClass: 'bg-emerald-500',
      percent: 75,
    }
  }
  return {
    score: 4,
    label: t('vault-utils.strength-excellent'),
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

function intlLocale(): string {
  return i18n.language === 'en' ? 'en-GB' : 'it-IT'
}

// i18n.language e' reactive: i formatter vengono ricreati quando cambia lingua
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(
  kind: 'relative' | 'short' | 'time',
): Intl.DateTimeFormat {
  const locale = intlLocale()
  const key = `${locale}:${kind}`
  const cached = formatterCache.get(key)
  if (cached) return cached
  const options =
    kind === 'time'
      ? { hour: '2-digit', minute: '2-digit' } as const
      : kind === 'short'
        ? { day: 'numeric', month: 'short', year: 'numeric' } as const
        : { day: '2-digit', month: 'short', year: 'numeric' } as const
  const fmt = new Intl.DateTimeFormat(locale, options)
  formatterCache.set(key, fmt)
  return fmt
}

const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000

export function formatRelativeDate(iso: string): string {
  try {
    const date = new Date(iso)
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return t('vault-utils.rel-just-now')
    if (diffMin < 60) return t('vault-utils.rel-minutes-ago', { count: diffMin })
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return t('vault-utils.rel-hours-ago', { count: diffHours })
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return t('vault-utils.rel-days-ago', { count: diffDays })
    return getFormatter('relative').format(date)
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

    if (diffDays === 0) return t('vault-utils.mod-today')
    if (diffDays === 1) return t('vault-utils.mod-yesterday')
    if (diffDays < 7) return t('vault-utils.mod-days-ago', { count: diffDays })

    const diffWeeks = Math.floor(diffDays / 7)
    if (diffWeeks < 5) return t('vault-utils.mod-weeks-ago', { count: diffWeeks })

    const diffMonths = Math.max(1, Math.floor(diffDays / 30))
    if (diffMonths < 12) return t('vault-utils.mod-months-ago', { count: diffMonths })

    return t('vault-utils.mod-on', { date: formatShortDate(iso) })
  } catch {
    return ''
  }
}

export function formatShortDate(iso?: string | null): string {
  if (!iso) return '—'
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '—'
    return getFormatter('short').format(date).replace('.', '')
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

    const timeStr = getFormatter('time').format(date)

    if (isToday) return t('vault-utils.access-today', { time: timeStr })
    if (isYesterday) return t('vault-utils.access-yesterday', { time: timeStr })
    return t('vault-utils.access-on', { date: formatShortDate(iso), time: timeStr })
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

export interface VaultColorPalette {
  label: string
  hex: string
  bg: string
  text: string
  dot: string
  ring: string
  style: CSSProperties
}

function palette(labelKey: string, hex: string): VaultColorPalette {
  return {
    get label() {
      return t(`vault-utils.${labelKey}`)
    },
    hex,
    bg: 'vault-color-bg',
    text: 'vault-color-text',
    dot: 'vault-color-dot',
    ring: 'vault-color-ring',
    style: { '--vc': hex } as CSSProperties,
  }
}

export const VAULT_COLORS: Record<string, VaultColorPalette> = {
  indigo: palette('color-indigo', '#6366f1'),
  emerald: palette('color-emerald', '#10b981'),
  amber: palette('color-amber', '#f59e0b'),
  rose: palette('color-rose', '#f43f5e'),
  sky: palette('color-sky', '#0ea5e9'),
  violet: palette('color-violet', '#8b5cf6'),
  orange: palette('color-orange', '#f97316'),
  lime: palette('color-lime', '#84cc16'),
}

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function isHexColor(color: string): boolean {
  return HEX_COLOR_RE.test(color.trim())
}

export function normalizeHexColor(color: string): string {
  const hex = color.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  }
  return hex
}

export function getVaultColor(color: string): VaultColorPalette {
  const key = color?.trim().toLowerCase() ?? ''
  if (HEX_COLOR_RE.test(key)) {
    const hex = normalizeHexColor(key)
    const base = palette('color-custom', hex)
    return {
      ...base,
      get label() {
        return t('vault-utils.color-custom', { hex })
      },
    }
  }
  return VAULT_COLORS[key] ?? VAULT_COLORS.indigo
}
