import { useRef } from 'react'
import { Pipette } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getVaultColor, VAULT_COLORS } from '@/lib/vault-utils'

interface VaultColorPickerProps {
  value: string
  onChange: (color: string) => void
}

export function VaultColorPicker({ value, onChange }: VaultColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const palette = getVaultColor(value)
  const isCustom = !(value.trim().toLowerCase() in VAULT_COLORS)

  return (
    <div className="space-y-2">
      <div className="relative">
        <button
          type="button"
          title="Scegli un colore personalizzato"
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex w-full cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
            isCustom
              ? 'border-primary bg-accent font-medium text-accent-foreground'
              : 'hover:bg-muted',
          )}
        >
          <span
            className="size-3.5 shrink-0 rounded-full border border-black/20 dark:border-white/20"
            style={{ backgroundColor: palette.hex }}
          />
          <span className="flex-1 truncate text-left">{palette.label}</span>
          <Pipette className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
        <input
          ref={inputRef}
          type="color"
          value={palette.hex}
          onChange={(e) => onChange(e.target.value)}
          className="pointer-events-none absolute size-px opacity-0"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      <div className="grid grid-cols-8 gap-1.5">
        {Object.entries(VAULT_COLORS).map(([key, p]) => {
          const selected = value === key
          return (
            <button
              key={key}
              type="button"
              title={p.label}
              aria-label={p.label}
              onClick={() => onChange(key)}
              className="flex h-7 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-muted"
              style={
                selected
                  ? {
                      boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${p.hex}`,
                    }
                  : undefined
              }
            >
              <span
                className="size-3.5 rounded-full border border-black/10 dark:border-white/10"
                style={{ backgroundColor: p.hex }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
