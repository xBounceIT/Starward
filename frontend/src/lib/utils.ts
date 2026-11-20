import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Copy text to the system clipboard.
 *
 * `navigator.clipboard` is only exposed in secure contexts (HTTPS or
 * localhost). When the app is served over plain HTTP on a LAN address
 * (e.g. http://192.168.x.x:3000) it is `undefined` in both Chrome and
 * Firefox, so `writeText` would throw. This helper uses the async Clipboard
 * API when available and otherwise falls back to the legacy
 * `document.execCommand('copy')` path, which still works on insecure
 * origins as long as it runs inside a user gesture.
 *
 * Returns true when the text was copied, false otherwise.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or transient activation lost: try the fallback.
    }
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    // Off-screen but still rendered: display:none breaks execCommand in some browsers.
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
