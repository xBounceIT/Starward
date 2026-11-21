import { FileSpreadsheet } from 'lucide-react'

interface ImportProviderIconProps {
  providerId: string
  className?: string
}

export function ImportProviderIcon({
  providerId,
  className = 'size-4',
}: ImportProviderIconProps) {
  switch (providerId) {
    case 'bitwarden':
    case 'bitwarden_json':
    case 'bitwarden_csv':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <path
            d="M12 2.5 4.5 5.4v6.3c0 4.6 3.2 8.7 7.5 9.8 4.3-1.1 7.5-5.2 7.5-9.8V5.4L12 2.5Z"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <path
            d="M12 4.3v15.2c3.2-1 5.6-4.2 5.6-7.8V6.5L12 4.3Z"
            fill="currentColor"
          />
        </svg>
      )

    case '1password':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="8.8"
            stroke="currentColor"
            strokeWidth={1.8}
          />
          <circle
            cx="12"
            cy="12"
            r="5.2"
            stroke="currentColor"
            strokeWidth={1.5}
            opacity={0.55}
          />
          <rect
            x="10.4"
            y="7.6"
            width="3.2"
            height="8.8"
            rx="1.2"
            fill="currentColor"
          />
        </svg>
      )

    case 'lastpass':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <circle cx="5.5" cy="12" r="2.1" fill="currentColor" />
          <circle cx="11" cy="12" r="2.1" fill="currentColor" />
          <circle cx="16.5" cy="12" r="2.1" fill="currentColor" />
          <rect
            x="20"
            y="6.5"
            width="1.9"
            height="11"
            rx="0.95"
            fill="currentColor"
          />
        </svg>
      )

    case 'keepass':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <rect
            x="4.5"
            y="10.5"
            width="15"
            height="10.5"
            rx="2.4"
            stroke="currentColor"
            strokeWidth={1.8}
          />
          <path
            d="M8 10.5V7.8a4 4 0 1 1 8 0v2.7"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <circle cx="12" cy="14.7" r="1.5" fill="currentColor" />
          <path
            d="M12 16v2.2"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </svg>
      )

    case 'chrome':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth={1.8}
          />
          <circle
            cx="12"
            cy="12"
            r="3.4"
            stroke="currentColor"
            strokeWidth={1.8}
          />
          <path
            d="M12 8.6h8.2M9.1 13.7 5 6.6M14.9 13.7l-4.1 7.1"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        </svg>
      )

    case 'firefox':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <path
            d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8c0-2.6-1.1-5-2.9-6.6.4 1.6-.2 3.3-1.4 4.3a4.3 4.3 0 0 1-5.6 5.8 3.6 3.6 0 0 1-2.1-3.3c0-1.6 1-2.9 2.4-3.4-.9-.7-1.3-1.9-.9-3.1.2-.7.7-1.5 1.7-2.5Z"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'safari':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth={1.8}
          />
          <path
            d="m15.6 8.4-2.2 5.4-5.4 2.2 2.2-5.4 5.4-2.2Z"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
      )

    case 'dashlane':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <path
            d="M12 2.8 4.8 5.6v5.9c0 4.5 3.1 8.6 7.2 9.7 4.1-1.1 7.2-5.2 7.2-9.7V5.6L12 2.8Z"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <path
            d="M9.6 8.5h2.7a3.2 3.2 0 0 1 0 6.4H9.6V8.5Z"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'protonpass':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <path
            d="M5 7.5 12 3.5l7 4v5.2c0 3.9-2.8 7-7 8-4.2-1-7-4.1-7-8V7.5Z"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <circle cx="12" cy="11" r="1.8" fill="currentColor" />
          <path
            d="M10.8 12.6 10.3 16h3.4l-.5-3.4"
            fill="currentColor"
          />
        </svg>
      )

    case 'nordpass':
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={className}
          aria-hidden="true"
        >
          <path
            d="M4.2 17.5a9 9 0 1 1 15.6 0"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <path
            d="m6.2 17.5 3.5-5.6 2.3 3 2.5-4 3.3 6.6H6.2Z"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
        </svg>
      )

    case 'generic_csv':
    default:
      return <FileSpreadsheet className={className} />
  }
}
