import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type ThemeMode = 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

type ThemeContextValue = {
  mode: ThemeMode
  resolved: ResolvedTheme
  cycle: () => void
  /** Alias: current mode */
  theme: ThemeMode
  /** Alias: cycle to next theme */
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'ocr-dashboard-theme'
const CYCLE_ORDER: ThemeMode[] = ['light', 'dark']

function getStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable
  }
  return 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(getStoredMode)

  // Apply theme class to <html> and swap favicon
  const resolved = mode
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolved)

    // Use dark favicon on light backgrounds, light favicon on dark backgrounds
    const faviconHref = resolved === 'dark' ? '/favicon-light.ico' : '/favicon-dark.ico'
    const existing = document.querySelector<HTMLLinkElement>('link#favicon')
    if (existing) {
      existing.href = faviconHref
    }
  }, [resolved])

  // Persist mode
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // localStorage unavailable
    }
  }, [mode])

  const cycle = useCallback(() => {
    setMode((current) => {
      const idx = CYCLE_ORDER.indexOf(current)
      return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]!
    })
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, cycle, theme: mode, toggleTheme: cycle }),
    [mode, resolved, cycle],
  )


  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
