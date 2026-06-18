import type { LucideIcon } from 'lucide-react'
import { cn } from '../../../lib/utils'

type StatCardProps = {
  title: string
  value: number | string
  icon: LucideIcon
  trend?: 'up' | 'down'
}

export function StatCard({ title, value, icon: Icon, trend }: StatCardProps) {
  return (
    <div className="glass-card glass-card-hover rounded-xl p-6">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-emerald-500/10">
          <Icon className="h-4 w-4 text-zinc-500 dark:text-emerald-400" />
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold text-zinc-900 dark:text-white">
          {value}
        </span>
        {trend && (
          <span
            className={cn(
              'text-xs font-medium',
              trend === 'up'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {trend === 'up' ? '\u2191' : '\u2193'}
          </span>
        )}
      </div>
    </div>
  )
}
