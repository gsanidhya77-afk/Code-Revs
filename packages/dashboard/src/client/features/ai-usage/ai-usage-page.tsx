import { useQuery } from '@tanstack/react-query'
import { Bot, Cpu, Layers, ArrowDownToLine, ArrowUpFromLine, Zap, Database, GitBranch, DollarSign, ExternalLink } from 'lucide-react'
import { fetchApi } from '../../lib/utils'
import { StatCard } from '../home/components/stat-card'
import type { AiUsageStats, PerSessionUsageResponse, PerSessionUsageItem } from '../../lib/api-types'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function UsageTable({
  title,
  rows,
  total,
  labelKey,
}: {
  title: string
  rows: { label: string; count: number }[]
  total?: number
  labelKey?: string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</h2>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No data yet.</p>
      </div>
    )
  }

  const max = rows[0]?.count ?? 1

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</h2>
      <div className="space-y-3">
        {rows.map((row) => {
          const pct = total && total > 0 ? Math.round((row.count / total) * 100) : null
          return (
            <div key={row.label + (labelKey ?? '')}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate font-mono text-zinc-800 dark:text-zinc-200">
                  {row.label}
                </span>
                <div className="ml-4 flex shrink-0 items-center gap-2 tabular-nums">
                  <span className="text-zinc-500 dark:text-zinc-400">{row.count}</span>
                  {pct !== null && (
                    <span className="min-w-[3rem] rounded-full bg-indigo-500/15 px-2 py-0.5 text-center text-xs font-semibold text-indigo-400 dark:text-indigo-300">
                      {pct}%
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.round((row.count / max) * 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatCost(usd: number): string {
  if (usd < 0.0001) return '<$0.0001'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    closed: 'bg-zinc-200/80 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400',
    error:  'bg-red-500/15 text-red-600 dark:text-red-400',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${colors[status] ?? colors['closed']}`}>
      {status}
    </span>
  )
}

function PerSessionTable({ items }: { items: PerSessionUsageItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        No pipeline runs with token data yet. Cost stats appear after a review session completes.
      </div>
    )
  }

  const totalCost = items.reduce((s, r) => s + r.estimatedCostUsd, 0)
  const totalTokens = items.reduce((s, r) => s + r.tokens.total, 0)
  const trackedCount = items.filter((r) => r.tokens.total > 0).length

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      {/* Summary bar */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {items.length} pipeline run{items.length !== 1 ? 's' : ''}
          {trackedCount > 0
            ? ` · ${formatTokens(totalTokens)} total tokens`
            : ' · no token data (runs predate token tracking)'}
        </span>
        <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {totalCost > 0 ? `≈ ${formatCost(totalCost)} total` : '—'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800">
              <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">Branch / Session</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">Type</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">Status</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">Input</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">Output</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">Cache</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">Est. Cost</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr
                key={row.sessionId}
                className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 dark:border-zinc-800/50 dark:hover:bg-zinc-800/30"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <GitBranch className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span className="max-w-[180px] truncate font-mono text-xs text-zinc-800 dark:text-zinc-200" title={row.branch}>
                      {row.branch}
                    </span>
                  </div>
                  {row.prUrl ? (
                    <a
                      href={row.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-5 mt-0.5 flex items-center gap-0.5 font-mono text-[10px] text-indigo-500 hover:underline dark:text-indigo-400"
                    >
                      {row.prUrl.replace('https://github.com/', '')}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ) : (
                    <div className="ml-5 mt-0.5 font-mono text-[10px] text-zinc-400 dark:text-zinc-600">
                      {row.sessionId.slice(0, 8)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className="capitalize text-zinc-600 dark:text-zinc-400">{row.workflowType}</span>
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                  {formatTokens(row.tokens.input)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                  {formatTokens(row.tokens.output)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatTokens(row.tokens.cacheRead + row.tokens.cacheWrite)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {row.tokens.total > 0 ? (
                    <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatCost(row.estimatedCostUsd)}
                    </span>
                  ) : row.status === 'active' ? (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500" title="Token data will appear once this run finishes">
                      pending
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500" title="Token data was not captured for this run (run predates token tracking)">
                      no data
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-zinc-500 dark:text-zinc-400">
                  {formatDate(row.startedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-[10px] text-zinc-400 dark:text-zinc-600">
        * Costs are estimates based on public Claude API pricing. Actual charges depend on your plan.
      </p>
    </div>
  )
}

function TokenCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {formatTokens(value)}
      </div>
    </div>
  )
}

export function AiUsagePage() {
  const { data, isLoading, isError } = useQuery<AiUsageStats>({
    queryKey: ['ai-usage'],
    queryFn: () => fetchApi<AiUsageStats>('/api/ai-usage'),
    refetchInterval: 30_000,
  })

  const { data: perSession, isLoading: perSessionLoading } = useQuery<PerSessionUsageResponse>({
    queryKey: ['ai-usage-per-session'],
    queryFn: () => fetchApi<PerSessionUsageResponse>('/api/ai-usage/per-session'),
    refetchInterval: 30_000,
  })

  const total = data?.totalSessions ?? 0
  const t = data?.tokens
  const hasTokenData = t && t.sessionsWithUsage > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Tool Usage</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Lifetime totals for all AI agent sessions run through OCR.
        </p>
      </div>

      {isError && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
          Failed to load AI usage data.
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
      ) : (
        <>
          {/* Session summary */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard title="Total AI Sessions" value={total} icon={Bot} />
            <StatCard title="Vendors Used" value={data?.vendorsUsed ?? 0} icon={Layers} />
            <StatCard title="Models Used" value={data?.modelsUsed ?? 0} icon={Cpu} />
          </div>

          {/* Token usage */}
          <div>
            <h2 className="mb-3 text-base font-medium text-zinc-800 dark:text-zinc-200">
              Token Usage
            </h2>
            {hasTokenData ? (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <TokenCard
                  label="Input Tokens"
                  value={t.inputTokens}
                  icon={ArrowDownToLine}
                  color="text-blue-400"
                />
                <TokenCard
                  label="Output Tokens"
                  value={t.outputTokens}
                  icon={ArrowUpFromLine}
                  color="text-emerald-400"
                />
                <TokenCard
                  label="Cache Read"
                  value={t.cacheReadTokens}
                  icon={Zap}
                  color="text-amber-400"
                />
                <TokenCard
                  label="Cache Write"
                  value={t.cacheWriteTokens}
                  icon={Database}
                  color="text-purple-400"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                Token counts will appear here after your next review session completes. OCR now
                captures usage from Claude's terminal result line automatically.
              </div>
            )}
          </div>

          {/* Breakdown tables */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <UsageTable
              title="Sessions by Vendor"
              rows={(data?.byVendor ?? []).map((r) => ({ label: r.vendor, count: r.count }))}
              total={total}
              labelKey="vendor"
            />
            <UsageTable
              title="Sessions by Model"
              rows={(data?.byModel ?? []).map((r) => ({ label: r.model, count: r.count }))}
              total={total}
              labelKey="model"
            />
          </div>

          <UsageTable
            title="Sessions by Reviewer Persona"
            rows={(data?.byPersona ?? []).map((r) => ({ label: r.persona, count: r.count }))}
            total={total}
            labelKey="persona"
          />

          {/* Per-PR cost breakdown */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-zinc-500" />
              <h2 className="text-base font-medium text-zinc-800 dark:text-zinc-200">
                Cost Per Pipeline Run
              </h2>
            </div>
            {perSessionLoading ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
            ) : (
              <PerSessionTable items={perSession?.items ?? []} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
