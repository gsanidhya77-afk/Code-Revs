import { Link, useLocation } from 'react-router-dom'
import { Sun, Moon, Menu } from 'lucide-react'
import { useTheme } from '../../providers/theme-provider'
import { cn } from '../../lib/utils'

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
} as const

function buildBreadcrumbs(pathname: string): { label: string; path: string }[] {
  if (pathname === '/') return [{ label: 'Home', path: '/' }]

  const parts = pathname.split('/').filter(Boolean)
  const crumbs = [{ label: 'Home', path: '/' }]

  let accumulated = ''
  for (const part of parts) {
    accumulated += `/${part}`
    const label = part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' ')
    crumbs.push({ label, path: accumulated })
  }

  return crumbs
}

type HeaderProps = {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const { mode, cycle } = useTheme()
  const location = useLocation()
  const breadcrumbs = buildBreadcrumbs(location.pathname)

  const ThemeIcon = THEME_ICONS[mode]

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-white/[0.06] dark:bg-[rgba(6,10,20,0.8)] dark:[backdrop-filter:blur(14px)] md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100 md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <nav className="flex min-w-0 items-center gap-1 text-sm" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <span className="shrink-0 text-zinc-400 dark:text-zinc-600">/</span>
              )}
              {i < breadcrumbs.length - 1 ? (
                <Link
                  to={crumb.path}
                  className={cn(
                    'hidden shrink-0 text-zinc-500 dark:text-zinc-400 sm:inline',
                    'hover:text-zinc-700 dark:hover:text-zinc-200',
                  )}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={cycle}
          className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
          aria-label={`Theme: ${mode}. Click to cycle.`}
          title={`Theme: ${mode}`}
        >
          <ThemeIcon className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
