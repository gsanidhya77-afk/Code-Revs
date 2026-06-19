import { Router } from 'express'
import type { Database } from '@open-code-review/persistence'
import { getAiUsage, getTokenUsage, getPerSessionUsage, type PerSessionUsageRow } from '../db.js'

// ── Claude pricing (USD per 1M tokens, approximate mid-2025 rates) ──
const PRICING_PER_1M = {
  opus:    { input: 15,   output: 75,  cacheRead: 1.5,  cacheWrite: 18.75 },
  sonnet:  { input: 3,    output: 15,  cacheRead: 0.3,  cacheWrite: 3.75  },
  haiku:   { input: 0.8,  output: 4,   cacheRead: 0.08, cacheWrite: 1.0   },
} as const

type PricingTier = keyof typeof PRICING_PER_1M

function resolveTier(modelsUsed: string | null): PricingTier {
  if (!modelsUsed) return 'sonnet'
  const m = modelsUsed.toLowerCase()
  if (m.includes('opus')) return 'opus'
  if (m.includes('haiku')) return 'haiku'
  return 'sonnet'
}

function estimateCostUsd(row: PerSessionUsageRow): number {
  const p = PRICING_PER_1M[resolveTier(row.models_used)]
  return (
    (row.input_tokens       / 1_000_000) * p.input      +
    (row.output_tokens      / 1_000_000) * p.output     +
    (row.cache_read_tokens  / 1_000_000) * p.cacheRead  +
    (row.cache_write_tokens / 1_000_000) * p.cacheWrite
  )
}

export function createAiUsageRouter(db: Database): Router {
  const router = Router()

  // GET /api/ai-usage — AI tool session totals + token usage breakdown
  router.get('/', (_req, res) => {
    try {
      const usage = getAiUsage(db)
      const tokens = getTokenUsage(db)
      res.json({
        totalSessions: usage.total_sessions,
        vendorsUsed: usage.vendors_used,
        modelsUsed: usage.models_used,
        byVendor: usage.by_vendor,
        byModel: usage.by_model,
        byPersona: usage.by_persona,
        tokens: {
          inputTokens: tokens.total_input_tokens,
          outputTokens: tokens.total_output_tokens,
          cacheReadTokens: tokens.total_cache_read_tokens,
          cacheWriteTokens: tokens.total_cache_write_tokens,
          sessionsWithUsage: tokens.sessions_with_usage,
        },
      })
    } catch (err) {
      console.error('Failed to fetch AI usage:', err)
      res.status(500).json({ error: 'Failed to fetch AI usage' })
    }
  })

  // GET /api/ai-usage/per-session — per-PR token breakdown + estimated cost
  router.get('/per-session', (_req, res) => {
    try {
      const rows = getPerSessionUsage(db)
      const items = rows.map((row) => {
        const target = row.pr_target ?? null
        const isPrUrl = typeof target === 'string' && /^https?:\/\/(www\.)?github\.com\/.+\/pull\/\d+/.test(target)
        return {
          sessionId:       row.session_id,
          branch:          row.branch,
          status:          row.status,
          workflowType:    row.workflow_type,
          startedAt:       row.started_at,
          updatedAt:       row.updated_at,
          aiExecutions:    row.ai_executions,
          modelsUsed:      row.models_used,
          /** The PR URL when the review was triggered with a GitHub URL, else null. */
          prUrl:           isPrUrl ? target : null,
          tokens: {
            input:      row.input_tokens,
            output:     row.output_tokens,
            cacheRead:  row.cache_read_tokens,
            cacheWrite: row.cache_write_tokens,
            total:      row.input_tokens + row.output_tokens + row.cache_read_tokens + row.cache_write_tokens,
          },
          estimatedCostUsd: estimateCostUsd(row),
        }
      })
      res.json({ items })
    } catch (err) {
      console.error('Failed to fetch per-session usage:', err)
      res.status(500).json({ error: 'Failed to fetch per-session usage' })
    }
  })

  return router
}
