import { FileSpreadsheet } from 'lucide-react'
import onePasswordLogo from '@/assets/provider-icons/1password.svg'
import bitwardenLogo from '@/assets/provider-icons/bitwarden.svg'
import chromeLogo from '@/assets/provider-icons/chrome.svg'
import dashlaneLogo from '@/assets/provider-icons/dashlane.svg'
import firefoxLogo from '@/assets/provider-icons/firefox.svg'
import keePassLogo from '@/assets/provider-icons/keepass.svg'
import lastPassLogo from '@/assets/provider-icons/lastpass.svg'
import nordPassLogo from '@/assets/provider-icons/nordpass.svg'
import protonPassLogo from '@/assets/provider-icons/protonpass.svg'
import psonoLogo from '@/assets/provider-icons/psono.svg'
import safariLogo from '@/assets/provider-icons/safari.svg'
import { cn } from '@/lib/utils'

interface ImportProviderIconProps {
  providerId: string
  className?: string
}

const PROVIDER_LOGO_MAP: Record<string, string> = {
  bitwarden: bitwardenLogo,
  bitwarden_json: bitwardenLogo,
  bitwarden_csv: bitwardenLogo,
  vaultwarden: bitwardenLogo,
  '1password': onePasswordLogo,
  lastpass: lastPassLogo,
  keepass: keePassLogo,
  chrome: chromeLogo,
  firefox: firefoxLogo,
  safari: safariLogo,
  dashlane: dashlaneLogo,
  protonpass: protonPassLogo,
  nordpass: nordPassLogo,
  psono: psonoLogo,
}

/** Renders the official full-color brand logo for an import provider. */
export function ImportProviderIcon({
  providerId,
  className = 'size-4',
}: ImportProviderIconProps) {
  const logoSrc = PROVIDER_LOGO_MAP[providerId]

  if (logoSrc) {
    return (
      <img
        src={logoSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn('shrink-0 object-contain select-none', className)}
      />
    )
  }

  return (
    <FileSpreadsheet
      className={cn(
        'shrink-0 text-emerald-600 dark:text-emerald-400',
        className,
      )}
      aria-hidden="true"
    />
  )
}
