import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, Eye, EyeOff, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { generateTotp, parseTotpConfig } from '@/lib/otp'
import { cn, copyToClipboard } from '@/lib/utils'
import { t } from '@/lib/i18n'

interface OtpCodeCardProps {
  totpValue: string
  label?: string
  compact?: boolean
  showSecretToggle?: boolean
  className?: string
}

export function OtpCodeCard({
  totpValue,
  label = t('otp-code-card.codice-otp-2fa'),
  compact = false,
  showSecretToggle = true,
  className,
}: OtpCodeCardProps) {
  const parsed = useMemo(() => parseTotpConfig(totpValue), [totpValue])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [secretExpanded, setSecretExpanded] = useState(false)
  const [secretRevealed, setSecretRevealed] = useState(false)

  const copyCodeTimerRef = useRef<number | null>(null)
  const copySecretTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setNowMs(Date.now())
    setCopiedCode(false)
    setCopiedSecret(false)
    setSecretExpanded(false)
    setSecretRevealed(false)
  }, [totpValue])

  useEffect(() => {
    if (!parsed.ok) return
    const timerId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 200)
    return () => window.clearInterval(timerId)
  }, [parsed.ok])

  useEffect(() => {
    return () => {
      if (copyCodeTimerRef.current !== null) {
        window.clearTimeout(copyCodeTimerRef.current)
      }
      if (copySecretTimerRef.current !== null) {
        window.clearTimeout(copySecretTimerRef.current)
      }
    }
  }, [])

  const otp = useMemo(() => {
    if (!parsed.ok) return null
    return generateTotp(parsed.config, nowMs)
  }, [parsed, nowMs])

  const handleCopyCode = async () => {
    if (!parsed.ok) return
    const fresh = generateTotp(parsed.config, Date.now())
    if (await copyToClipboard(fresh.code)) {
      setCopiedCode(true)
      toast.success(t('otp-code-card.codice-otp-copiato-negli-appunti'))
      if (copyCodeTimerRef.current !== null) {
        window.clearTimeout(copyCodeTimerRef.current)
      }
      copyCodeTimerRef.current = window.setTimeout(() => {
        setCopiedCode(false)
      }, 1800)
    } else {
      toast.error(t('otp-code-card.impossibile-copiare-negli-appunti'))
    }
  }

  const handleCopySecret = async () => {
    const clean = totpValue.trim()
    if (!clean) return
    if (await copyToClipboard(clean)) {
      setCopiedSecret(true)
      toast.success(t('otp-code-card.segreto-otp-copiato-negli-appunti'))
      if (copySecretTimerRef.current !== null) {
        window.clearTimeout(copySecretTimerRef.current)
      }
      copySecretTimerRef.current = window.setTimeout(() => {
        setCopiedSecret(false)
      }, 1800)
    } else {
      toast.error(t('otp-code-card.impossibile-copiare-negli-appunti'))
    }
  }

  if (!parsed.ok || !otp) {
    return (
      <div className={cn('min-w-0 space-y-1.5', className)}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-[11px] font-bold tracking-wider sync-security:text-[#ff9c00] uppercase">
            {label}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">{t('otp-code-card.configurazione-otp-non-valida')}</p>
              <p className="truncate text-[11px] text-destructive/85">
                {parsed.ok ? t('otp-code-card.segreto-non-valido') : parsed.error}
              </p>
            </div>
          </div>
          {showSecretToggle && (
            <button
              type="button"
              onClick={handleCopySecret}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/15"
              title={t('otp-code-card.copia-valore-grezzo')}
            >
              {copiedSecret ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    )
  }

  const hasCustomParams =
    parsed.config.algorithm !== 'SHA1' ||
    parsed.config.digits !== 6 ||
    parsed.config.period !== 30

  const isExpiringSoon = otp.remainingSeconds <= 5
  const isCritical = otp.remainingSeconds <= 2

  const radius = compact ? 13 : 15
  const viewBoxSize = compact ? 32 : 36
  const center = viewBoxSize / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - otp.progress)

  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-muted-foreground text-[11px] font-bold tracking-wider sync-security:text-[#ff9c00] uppercase">
            {label}
          </p>
          {hasCustomParams && (
            <span className="shrink-0 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground sync-security:border-white/15 sync-security:bg-[#000c20]/60">
              {otp.algorithm} · {otp.digits} {t('otp-code-card.cifre')} {otp.period}s
            </span>
          )}
        </div>

        {showSecretToggle && (
          <button
            type="button"
            onClick={() => setSecretExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            title={
              secretExpanded
                ? t('otp-code-card.nascondi-segreto-otp')
                : t('otp-code-card.mostra-segreto-otp-configurato')
            }
          >
            <KeyRound className="size-3" />
            <span>{secretExpanded ? t('otp-code-card.nascondi-chiave') : 'Chiave'}</span>
          </button>
        )}
      </div>

      <div className="relative overflow-hidden rounded-lg border border-border/70 bg-card/50 sync-security:border-white/15 sync-security:bg-[#0e1b33]">
        <div
          className={cn(
            'flex items-center justify-between gap-3 px-3.5',
            compact ? 'py-2' : 'py-2.5',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            {/* Circular Countdown Ring */}
            <div
              className="relative flex shrink-0 items-center justify-center"
              style={{ width: viewBoxSize, height: viewBoxSize }}
              title={t('otp-code-card.valido-per-altri-v0-s', { v0: otp.remainingSeconds })}
            >
              <svg
                width={viewBoxSize}
                height={viewBoxSize}
                viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
                className="-rotate-90"
                aria-hidden="true"
              >
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  strokeWidth="2.5"
                  className="stroke-border/60 sync-security:stroke-white/15"
                />
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className={cn(
                    'transition-[stroke-dashoffset,stroke] duration-200 ease-linear',
                    isCritical
                      ? 'stroke-destructive'
                      : isExpiringSoon
                        ? 'stroke-amber-500'
                        : 'stroke-primary sync-security:stroke-[#ff9c00]',
                  )}
                />
              </svg>
              <span
                className={cn(
                  'absolute font-mono text-[11px] font-bold tabular-nums',
                  isCritical
                    ? 'text-destructive'
                    : isExpiringSoon
                      ? 'text-amber-500 dark:text-amber-400'
                      : 'text-foreground/90',
                )}
              >
                {otp.remainingSeconds}
              </span>
            </div>

            {/* Live OTP Code (click to copy) */}
            <button
              type="button"
              onClick={handleCopyCode}
              className="group min-w-0 cursor-pointer text-left focus-visible:outline-none"
              title={t('otp-code-card.clicca-per-copiare-il-codice-otp')}
            >
              <span
                data-testid="otp-live-code"
                className={cn(
                  'block whitespace-nowrap font-mono font-bold tabular-nums transition-colors',
                  otp.digits >= 8
                    ? 'text-xl tracking-[0.12em]'
                    : compact
                      ? 'text-xl tracking-[0.16em]'
                      : 'text-2xl tracking-[0.16em]',
                  isCritical
                    ? 'text-destructive'
                    : isExpiringSoon
                      ? 'text-amber-500 dark:text-amber-400'
                      : 'text-foreground group-hover:text-primary sync-security:text-[#ff9c00] sync-security:group-hover:text-white',
                )}
              >
                {otp.formattedCode}
              </span>
              {(parsed.config.issuer || parsed.config.label) && (
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {parsed.config.issuer || parsed.config.label}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyCode}
            aria-label={t('otp-code-card.copia-codice-otp')}
            title={t('otp-code-card.copia-codice-otp')}
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border/70 bg-background/70 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground sync-security:border-white/15 sync-security:bg-[#000c20]/70 sync-security:hover:border-[#ff9c00]/60 sync-security:hover:text-[#ff9c00]"
          >
            {copiedCode ? (
              <>
                <Check className="size-3.5 text-emerald-400" />
                <span className="text-emerald-500 dark:text-emerald-400">
                  {t('otp-code-card.copiato')}</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                <span>{t('otp-code-card.copia')}</span>
              </>
            )}
          </button>
        </div>

        {/* Bottom Countdown Progress Bar */}
        <div className="h-1 w-full bg-border/40 sync-security:bg-white/10">
          <div
            className={cn(
              'h-full transition-[width,background-color] duration-200 ease-linear',
              isCritical
                ? 'bg-destructive'
                : isExpiringSoon
                  ? 'bg-amber-500'
                  : 'bg-primary sync-security:bg-[#ff9c00]',
            )}
            style={{ width: `${Math.round(otp.progress * 100)}%` }}
          />
        </div>
      </div>

      {/* Expandable Configured Secret / URI */}
      {showSecretToggle && secretExpanded && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 sync-security:border-white/10 sync-security:bg-[#000c20]/60">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase">
              {t('otp-code-card.segreto-configurato')}</p>
            <span className="mt-0.5 block truncate font-mono text-xs text-foreground/90">
              {secretRevealed ? totpValue.trim() : '••••••••••••••••••••••••'}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setSecretRevealed((prev) => !prev)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              title={secretRevealed ? t('otp-code-card.nascondi-segreto') : t('otp-code-card.mostra-segreto')}
            >
              {secretRevealed ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={handleCopySecret}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              title={t('otp-code-card.copia-segreto-otp')}
            >
              {copiedSecret ? (
                <Check className="size-3.5 text-emerald-400" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
