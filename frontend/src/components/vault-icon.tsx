import {
  Building2,
  CreditCard,
  Database,
  FileText,
  Folder,
  Globe,
  KeyRound,
  Lock,
  Server,
  Shield,
  Terminal,
  Users,
} from 'lucide-react'

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
      return <KeyRound className={className} />
    case 'database':
      return <Database className={className} />
    case 'ssh':
      return <Terminal className={className} />
    case 'card':
      return <CreditCard className={className} />
    case 'note':
      return <FileText className={className} />
    default:
      return <Globe className={className} />
  }
}
