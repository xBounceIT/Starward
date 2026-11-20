import { useState } from 'react'
import { Check, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  evaluatePasswordStrength,
  generateSecurePassword,
  type PasswordOptions,
} from '@/lib/utils'

interface PasswordGeneratorProps {
  onSelect: (password: string) => void
}

export function PasswordGenerator({ onSelect }: PasswordGeneratorProps) {
  const [options, setOptions] = useState<PasswordOptions>({
    length: 20,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  })
  const [generated, setGenerated] = useState(() =>
    generateSecurePassword({
      length: 20,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
    }),
  )

  const strength = evaluatePasswordStrength(generated)

  const regenerate = (next: PasswordOptions = options) => {
    setOptions(next)
    setGenerated(generateSecurePassword(next))
  }

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" />
          Generatore Password
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => regenerate()}
          title="Rigenera"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      <div className="rounded-lg border bg-muted/50 px-3 py-2.5 font-mono text-xs break-all select-all">
        {generated}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Robustezza</span>
          <span className="font-medium">{strength.label}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all duration-300 ${strength.colorClass}`}
            style={{ width: `${strength.percent}%` }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <Label htmlFor="gen-length" className="text-xs">
            Lunghezza
          </Label>
          <span className="font-mono font-semibold">{options.length}</span>
        </div>
        <input
          id="gen-length"
          type="range"
          min={10}
          max={40}
          value={options.length}
          onChange={(e) =>
            regenerate({ ...options, length: Number(e.target.value) })
          }
          className="w-full accent-primary cursor-pointer"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5 text-xs">
        <label className="flex items-center justify-between rounded-md border px-2.5 py-1.5 cursor-pointer">
          <span>A-Z</span>
          <Switch
            checked={options.uppercase}
            onCheckedChange={(v) => regenerate({ ...options, uppercase: v })}
          />
        </label>
        <label className="flex items-center justify-between rounded-md border px-2.5 py-1.5 cursor-pointer">
          <span>a-z</span>
          <Switch
            checked={options.lowercase}
            onCheckedChange={(v) => regenerate({ ...options, lowercase: v })}
          />
        </label>
        <label className="flex items-center justify-between rounded-md border px-2.5 py-1.5 cursor-pointer">
          <span>0-9</span>
          <Switch
            checked={options.numbers}
            onCheckedChange={(v) => regenerate({ ...options, numbers: v })}
          />
        </label>
        <label className="flex items-center justify-between rounded-md border px-2.5 py-1.5 cursor-pointer">
          <span>!@#$</span>
          <Switch
            checked={options.symbols}
            onCheckedChange={(v) => regenerate({ ...options, symbols: v })}
          />
        </label>
      </div>

      <Button
        type="button"
        className="w-full"
        size="sm"
        onClick={() => onSelect(generated)}
      >
        <Check className="size-3.5" />
        Usa questa password
      </Button>
    </div>
  )
}
