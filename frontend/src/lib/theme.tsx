import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type Theme = 'light' | 'dark' | 'sync-security'

export const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
  { value: 'sync-security', label: 'Sync Security' },
]

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'starward-theme'

function isValidTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'sync-security'
}

function applyThemeClasses(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark' || theme === 'sync-security')
  root.classList.toggle('sync-security', theme === 'sync-security')
  root.dataset.theme = theme
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    const resolved: Theme = isValidTheme(saved) ? saved : 'dark'
    setThemeState(resolved)
    applyThemeClasses(resolved)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    applyThemeClasses(next)
    localStorage.setItem(STORAGE_KEY, next)
  }, [])

  const toggleTheme = useCallback(() => {
    const order: Theme[] = ['dark', 'light', 'sync-security']
    setThemeState((current) => {
      const nextIndex = (order.indexOf(current) + 1) % order.length
      const next = order[nextIndex]
      applyThemeClasses(next)
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}
