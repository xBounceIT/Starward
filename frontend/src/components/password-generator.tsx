import { useState } from 'react'
import { Check, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  evaluatePasswordStrength,
  generateSecurePassword,
  type PasswordOptions,
} from '@/lib/vault-utils'
import { t } from '@/lib/i18n'

interface PasswordGeneratorProps {
  onSelect: (password: string) => void
  defaultOptions?: PasswordOptions
}

const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
}

export function PasswordGenerator({
  onSelect,
  defaultOptions = DEFAULT_PASSWORD_OPTIONS,
}: PasswordGeneratorProps) {
  const [options, setOptions] = useState<PasswordOptions>(defaultOptions)
  const [generated, setGenerated] = useState(() =>
    generateSecurePassword(defaultOptions),
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
          {t('password-generator.generatore-password')}</div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => regenerate()}
          title={t('password-generator.rigenera')}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      <div className="rounded-md border bg-muted/50 px-3 py-2.5 font-mono text-xs break-all select-all">
        {generated}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t('password-generator.robustezza')}</span>
          <span className="font-medium">{strength.label}</span>
        </div>
        <Progress value={strength.percent} className="h-1.5" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <Label htmlFor="gen-length" className="text-xs">
            {t('password-generator.lunghezza')}</Label>
          <span className="font-mono font-semibold">{options.length}</span>
        </div>
        <Slider
          id="gen-length"
          min={10}
          max={40}
          step={1}
          value={[options.length]}
          onValueChange={([length]) => regenerate({ ...options, length })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5 text-xs">
        <label className="flex cursor-pointer items-center justify-between rounded-md border px-2.5 py-1.5">
          <span>A-Z</span>
          <Switch
            checked={options.uppercase}
            onCheckedChange={(v) => regenerate({ ...options, uppercase: v })}
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between rounded-md border px-2.5 py-1.5">
          <span>a-z</span>
          <Switch
            checked={options.lowercase}
            onCheckedChange={(v) => regenerate({ ...options, lowercase: v })}
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between rounded-md border px-2.5 py-1.5">
          <span>0-9</span>
          <Switch
            checked={options.numbers}
            onCheckedChange={(v) => regenerate({ ...options, numbers: v })}
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between rounded-md border px-2.5 py-1.5">
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
        {t('password-generator.usa-questa-password')}</Button>
    </div>
  )
}
