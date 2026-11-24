import { useState, type CSSProperties } from 'react'

import { Check, ChevronDown } from 'lucide-react'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { getVaultColor, VAULT_COLORS } from '@/lib/vault-utils'
import { t } from '@/lib/i18n'

interface VaultColorPickerProps {
  value: string
  onChange: (color: string) => void
}

function mixWith(hex: string, target: string, amount: number): string {
  const h = hex.replace('#', '')
  const t = target.replace('#', '')
  const channel = (i: number) => {
    const from = parseInt(h.slice(i, i + 2), 16)
    const to = parseInt(t.slice(i, i + 2), 16)
    return Math.round(from + (to - from) * amount)
  }
  return `rgb(${channel(0)} ${channel(2)} ${channel(4)})`
}

/* Gem-like finish: a specular highlight plus a shaded lower rim, so each
   preset reads as an enamel dot rather than a flat fill. */
function gemBackground(hex: string): string {
  return [
    'radial-gradient(circle at 30% 25%, rgb(255 255 255 / 0.55), rgb(255 255 255 / 0) 46%)',
    `linear-gradient(155deg, ${mixWith(hex, '#ffffff', 0.28)} 0%, ${hex} 46%, ${mixWith(hex, '#000000', 0.24)} 100%)`,
  ].join(', ')
}

export function VaultColorPicker({ value, onChange }: VaultColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const palette = getVaultColor(value)
  const isCustom = !(value.trim().toLowerCase() in VAULT_COLORS)
  const preview = (hovered && VAULT_COLORS[hovered]) || palette

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t('vault-color-picker.scegli-un-colore')}
          className={cn(
            'flex w-full cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
            isCustom
              ? 'border-primary bg-accent font-medium text-accent-foreground'
              : 'hover:bg-muted',
          )}
        >
          <span
            className="size-3.5 shrink-0 rounded-full border border-black/20 dark:border-white/20"
            style={{ background: gemBackground(palette.hex) }}
          />
          <span className="flex-1 truncate text-left">{palette.label}</span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="vault-color-picker-popover w-auto p-3"
        style={{ '--vc': palette.hex } as CSSProperties}
      >
        <p className="mb-2.5 text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          {t('vault-color-picker.scegli-un-colore')}</p>

        <div className="grid grid-cols-4 gap-2">
          {Object.entries(VAULT_COLORS).map(([key, p]) => {
            const selected = value === key
            return (
              <button
                key={key}
                type="button"
                title={p.label}
                aria-label={p.label}
                aria-pressed={selected}
                onClick={() => {
                  onChange(key)
                  setOpen(false)
                }}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(key)}
                onBlur={() => setHovered(null)}
                className="vault-swatch relative size-10 cursor-pointer rounded-full"
                style={{
                  background: gemBackground(p.hex),
                  boxShadow: selected
                    ? `0 0 0 2px var(--popover), 0 0 0 4px ${p.hex}, inset 0 0 0 1px rgb(0 0 0 / 0.08)`
                    : 'inset 0 0 0 1px rgb(0 0 0 / 0.08), inset 0 -3px 6px rgb(0 0 0 / 0.15)',
                }}
              >
                {selected && (
                  <Check
                    className="absolute inset-0 m-auto size-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]"
                    strokeWidth={3}
                  />
                )}
              </button>
            )
          })}
        </div>

        <p className="mt-2.5 flex items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: preview.hex }}
          />
          <span className="font-medium text-foreground">{preview.label}</span>
          <span>{preview.hex.toUpperCase()}</span>
        </p>
      </PopoverContent>
    </Popover>
  )
}
