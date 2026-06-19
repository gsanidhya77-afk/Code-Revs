/**
 * Execution finalization — the single in-process owner of "this run is done".
 *
 * Extracted from command-runner.ts (round-1 S28; the named first-wins claim is
 * round-1 S23; the ownership-boundary contract below is round-2 S2).
 *
 * ── Sweep / finalize ownership boundary (round-2 S2) ──
 * Two independent actors can mark a `command_executions` row finished:
 *
 *   1. THIS module (`finishExecution`) — owns every execution the dashboard
 *      spawned and still tracks in the in-memory `activeCommands` registry. It
 *      is triggered by the vendor `result` event, `proc.on('close')`, the
 *      watchdog, or cancel. Among those same-process triggers, the in-memory
 *      `tryClaimFinalization` claim guarantees exactly one runs the body.
 *
 *   2. The cross-process LIVENESS SWEEP (CLI `reconcileCompletedSessions` /
 *      the agent-session orphan stamp) — owns rows whose OWNING PROCESS IS
 *      GONE (dashboard crashed/restarted), which this module can no longer see
 *      because its `activeCommands` entry died with the process.
 *
 * The two never both own the same live row: while a row's owner is alive it is
 * in `activeCommands` and the sweep leaves it alone; once the owner is gone the
 * sweep takes over. The shared backstop that makes the boundary safe even
 * during the handoff window is the DB CAS — every finalizing UPDATE is gated on
 * `finished_at IS NULL`, so whichever actor writes first wins and the other's
 * write is a 0-row no-op. The in-memory claim de-dupes same-process triggers;
 * the DB CAS de-dupes across processes.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Server as SocketIOServer } from 'socket.io'
import type { Database } from '@open-code-review/persistence'
import { appendCommandLog, CANCELLED_EXIT_CODE } from '@open-code-review/persistence'
import { reconcileWorkflowOnExit } from '@open-code-review/persistence/state'
import {
  deriveCommandOutcome,
  deriveCancellationReason,
  getWorkflowCompletenessForExecution,
} from '../services/command-outcome.js'
import { activeCommands, type ProcessEntry } from './process-registry.js'

/**
 * First-wins finalization claim (round-1 S23).
 *
 * Finalization may be triggered by the `result` event, the `close` handler, the
 * watchdog, or cancel. This is the explicit, testable claim that lets exactly
 * one of them run the finalize body: the first caller for a given entry returns
 * `true` (and the entry's watchdog timer + file tailer are released here so they
 * cannot fire after the claim); every later caller returns `false`.
 *
 * A `undefined` entry (no in-memory record — e.g. a late close on a stale
 * execution the registry already dropped) returns `true`: there is no
 * same-process trigger left to de-dupe against, so the caller proceeds to the
 * DB CAS, which arbitrates on its own.
 */
export function tryClaimFinalization(entry: ProcessEntry | undefined): boolean {
  if (!entry) return true
  if (entry.finalized) return false
  entry.finalized = true
  if (entry.watchdog) {
    clearInterval(entry.watchdog)
    entry.watchdog = undefined
  }
  // Backstop: release the file-stdio tailer's fd/timer on ANY finalize path
  // (watchdog/cancel may finalize before `proc.on('close')` fires). Idempotent
  // — the close handler's own stop() becomes a no-op. The close handler still
  // owns the ordered final drain in the normal path.
  if (entry.tailer) {
    entry.tailer.stop()
    entry.tailer = undefined
  }
  return true
}

export function finishExecution(
  io: SocketIOServer,
  db: Database,
  ocrDir: string,
  executionId: number,
  rawCode: number | null,
  output: string,
): void {
  const finishedAt = new Date().toISOString()
  const entry = activeCommands.get(executionId)

  // Cancel wins the exit code regardless of which trigger finalizes (round-1
  // SF4/S11). The cancel handler reaps the tree but defers finalization to
  // `close`; if the agent had emitted `result` first, the watchdog's
  // result-grace branch could otherwise finalize the cancelled run with 0/1,
  // losing the cancellation in the recorded code + `cancellation_reason`.
  const code = entry?.cancelled ? CANCELLED_EXIT_CODE : rawCode

  // First-wins claim (round-1 S23): only the first trigger for this entry runs
  // the body; the rest are no-ops. Without this, the same execution would be
  // double-finalized (and double-emitted) when more than one trigger fires.
  // Clears the watchdog + tailer as part of the claim.
  if (!tryClaimFinalization(entry)) return

  // Fallback: if the in-memory tokenUsage was not set (result event processed
  // after finalization claimed, or delivered via a path that bypassed
  // handleEvent), scan the exec log file for the terminal `result` line and
  // parse usage directly. Best-effort — any failure is silently ignored so the
  // finalization never blocks on it.
  if (entry && !entry.tokenUsage && entry.uid) {
    entry.tokenUsage = parseTokenUsageFromLog(ocrDir, entry.uid)
  }

  // CAS write — only finalize a row still in-flight, so a late close after an
  // already-finalized result can never clobber the recorded exit code. Use the
  // native prepared statement: the engine's `run()` returns void (it discards
  // node:sqlite's StatementResultingChanges), whereas `prepare().run()` hands
  // back `{ changes }` — which the CAS check below depends on.
  const tokenUsage = entry?.tokenUsage ?? null
  const res = db
    .prepare(
      `UPDATE command_executions
       SET exit_code = ?, finished_at = ?, output = ?, pid = NULL,
           input_tokens = COALESCE(input_tokens, ?),
           output_tokens = COALESCE(output_tokens, ?),
           cache_read_tokens = COALESCE(cache_read_tokens, ?),
           cache_write_tokens = COALESCE(cache_write_tokens, ?)
       WHERE id = ? AND finished_at IS NULL`
    )
    .run(
      code,
      finishedAt,
      output,
      tokenUsage?.inputTokens ?? null,
      tokenUsage?.outputTokens ?? null,
      tokenUsage?.cacheReadTokens ?? null,
      tokenUsage?.cacheWriteTokens ?? null,
      executionId,
    )
  // Row already finalized in the DB (e.g. by a prior trigger on a stale entry)
  // — nothing more to emit. `changes` is typed number|bigint; coerce so the
  // zero-check is robust regardless of the binding's numeric representation.
  if (Number(res.changes) === 0 && !entry) return

  // Cross-check workflow completeness (event-derived, via the
  // session_completeness view) so the UI distinguishes a genuinely finished
  // workflow from one that exited 0 while incomplete — including the
  // "closed too soon" case. Under WAL the read is live (no merge needed);
  // it runs AFTER the exit_code UPDATE above so it sees current data.
  const completeness = getWorkflowCompletenessForExecution(db, executionId)
  const outcome = deriveCommandOutcome(code, completeness)
  // Orthogonal discriminator within the 'cancelled' bucket — kept in sync
  // with the /history projection so live and replayed rows agree.
  const cancellationReason = deriveCancellationReason(code)

  // Best-effort JSONL backup
  if (entry?.uid) {
    appendCommandLog(ocrDir, {
      v: 1,
      uid: entry.uid,
      db_id: executionId,
      command: entry.commandStr,
      args: entry.argsJson ?? null,
      exit_code: code,
      started_at: entry.startedAt,
      finished_at: finishedAt,
      is_detached: entry.detached ? 1 : 0,
      event: code === CANCELLED_EXIT_CODE ? 'cancel' : 'finish',
      writer: 'dashboard',
    })
  }

  io.emit('command:finished', {
    execution_id: executionId,
    exitCode: code,
    finished_at: finishedAt,
    outcome,
    cancellation_reason: cancellationReason,
  })

  activeCommands.delete(executionId)

  // Auto-finalize the linked workflow's session if this was the last execution
  // of a provably-complete round. This closes the wedge's lasting symptom: an
  // agent that finished its round but died before `ocr state finish` would
  // otherwise leave the session `active`+`complete` forever. reconcileWorkflowOnExit
  // no-ops unless the session is active, the round is complete, and nothing
  // else is in flight — so it is safe to fire on every execution. Fire-and-
  // forget: finalization of the execution row must not block on it, and a
  // reconcile failure must never surface as a command error.
  const workflowRow = db.exec(
    'SELECT workflow_id FROM command_executions WHERE id = ?',
    [executionId],
  )
  const workflowId = workflowRow[0]?.values[0]?.[0]
  if (typeof workflowId === 'string' && workflowId.length > 0) {
    // Reuse the dashboard's open handle (avoids a redundant ensureDatabase per
    // finalize) and leave a debug paper trail of the outcome — a later
    // post-mortem can see WHY a session did or didn't auto-close (round-1 S20/S21).
    void reconcileWorkflowOnExit(ocrDir, workflowId, db)
      .then((outcome) => {
        if (outcome === 'closed') {
          console.log(`[command-runner] auto-finalized workflow ${workflowId}`)
          injectCostIntoFinalMd(db, workflowId)
        } else if (outcome === 'incomplete' || outcome === 'in-flight') {
          console.debug(
            `[command-runner] workflow ${workflowId} not finalized: ${outcome}`,
          )
        }
      })
      .catch((err) => {
        console.error(
          `[command-runner] reconcileWorkflowOnExit(${workflowId}) failed:`,
          err instanceof Error ? err.message : err,
        )
      })
  }
}

/**
 * Last-resort token recovery: scans the per-execution log file for the
 * terminal `{"type":"result",...}` line and extracts usage from it.
 *
 * Called when `entry.tokenUsage` is null at finalization time — which happens
 * when the result event was written to the log file but not yet read by the
 * file tailer before finalization claimed (e.g. the watchdog fired between
 * the last tailer poll and the process exit). Reads the log synchronously so
 * it can run inline in the same finalization call before the DB update.
 */
function parseTokenUsageFromLog(
  ocrDir: string,
  uid: string,
): { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } | undefined {
  try {
    const logPath = join(ocrDir, 'data', 'exec-logs', `${uid}.log`)
    if (!existsSync(logPath)) return undefined

    const content = readFileSync(logPath, 'utf8')
    // Scan lines in reverse — the result line is always last
    const lines = content.split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]?.trim()
      if (!line) continue
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(line) as Record<string, unknown>
      } catch {
        continue
      }
      if (parsed['type'] !== 'result') continue

      const rawUsage = parsed['usage'] as Record<string, unknown> | undefined
      if (!rawUsage || typeof rawUsage !== 'object') return undefined

      return {
        inputTokens:      typeof rawUsage['input_tokens'] === 'number' ? rawUsage['input_tokens'] : 0,
        outputTokens:     typeof rawUsage['output_tokens'] === 'number' ? rawUsage['output_tokens'] : 0,
        cacheReadTokens:  typeof rawUsage['cache_read_input_tokens'] === 'number' ? rawUsage['cache_read_input_tokens'] : 0,
        cacheWriteTokens: typeof rawUsage['cache_creation_input_tokens'] === 'number' ? rawUsage['cache_creation_input_tokens'] : 0,
      }
    }
  } catch {
    // best-effort — never block finalization
  }
  return undefined
}

// ── Claude pricing (USD per 1M tokens, approximate mid-2025 rates) ──
const COST_PRICING_PER_1M = {
  opus:   { input: 15,   output: 75,  cacheRead: 1.5,  cacheWrite: 18.75 },
  sonnet: { input: 3,    output: 15,  cacheRead: 0.3,  cacheWrite: 3.75  },
  haiku:  { input: 0.8,  output: 4,   cacheRead: 0.08, cacheWrite: 1.0   },
} as const

function formatCostUsd(usd: number): string {
  if (usd < 0.0001) return '<$0.0001'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * Appends a "## AI Cost" section to the session's latest final.md once the
 * workflow closes. Reads token sums from `command_executions`, estimates cost
 * using the same pricing table as the AI Usage dashboard, then writes the
 * section to disk. Idempotent — exits early if the section is already present
 * or if no token data is available.
 */
function injectCostIntoFinalMd(db: Database, workflowId: string): void {
  try {
    // 1. Locate the session's latest round directory
    const sessionRows = db.exec(
      'SELECT session_dir, current_round FROM sessions WHERE id = ?',
      [workflowId],
    )
    const sessionRow = sessionRows[0]?.values[0]
    if (!sessionRow) return

    const [sessionDir, currentRound] = sessionRow
    if (typeof sessionDir !== 'string' || typeof currentRound !== 'number') return

    const finalPath = join(sessionDir, 'rounds', `round-${currentRound}`, 'final.md')
    if (!existsSync(finalPath)) return

    const existing = readFileSync(finalPath, 'utf8')
    if (existing.includes('## AI Cost')) return  // already injected

    // 2. Aggregate token usage across all AI executions for this session
    const tokenRows = db.exec(
      `SELECT
         COALESCE(SUM(input_tokens), 0)       AS input,
         COALESCE(SUM(output_tokens), 0)      AS output,
         COALESCE(SUM(cache_read_tokens), 0)  AS cache_read,
         COALESCE(SUM(cache_write_tokens), 0) AS cache_write,
         GROUP_CONCAT(DISTINCT COALESCE(resolved_model, vendor)) AS models_used
       FROM command_executions
       WHERE workflow_id = ? AND vendor IS NOT NULL`,
      [workflowId],
    )
    const tokenRow = tokenRows[0]?.values[0]
    if (!tokenRow) return

    const [inputRaw, outputRaw, cacheReadRaw, cacheWriteRaw, modelsUsedRaw] = tokenRow
    const input      = Number(inputRaw)
    const output     = Number(outputRaw)
    const cacheRead  = Number(cacheReadRaw)
    const cacheWrite = Number(cacheWriteRaw)
    const totalTokens = input + output + cacheRead + cacheWrite
    if (totalTokens === 0) return

    // 3. Estimate cost (same tier logic as the AI Usage route)
    const models = typeof modelsUsedRaw === 'string' ? modelsUsedRaw.toLowerCase() : ''
    const tier = models.includes('opus') ? 'opus' : models.includes('haiku') ? 'haiku' : 'sonnet'
    const p = COST_PRICING_PER_1M[tier]
    const costUsd =
      (input      / 1_000_000) * p.input      +
      (output     / 1_000_000) * p.output     +
      (cacheRead  / 1_000_000) * p.cacheRead  +
      (cacheWrite / 1_000_000) * p.cacheWrite

    // 4. Append cost section to final.md
    const costSection = [
      '',
      '---',
      '',
      '## AI Cost',
      '',
      '| | Tokens |',
      '|---|---|',
      `| Input | ${formatTokenCount(input)} |`,
      `| Output | ${formatTokenCount(output)} |`,
      `| Cache Read | ${formatTokenCount(cacheRead)} |`,
      `| Cache Write | ${formatTokenCount(cacheWrite)} |`,
      `| **Total** | **${formatTokenCount(totalTokens)}** |`,
      '',
      `**Estimated cost**: ${formatCostUsd(costUsd)}`,
      '',
      `> Estimate based on public Claude API pricing (${tier} tier). Actual charges depend on your plan.`,
      '',
    ].join('\n')

    writeFileSync(finalPath, existing + costSection, 'utf8')
    console.log(`[command-runner] injected cost (${formatCostUsd(costUsd)}) into ${finalPath}`)
  } catch (err) {
    console.error(
      `[command-runner] injectCostIntoFinalMd(${workflowId}) failed:`,
      err instanceof Error ? err.message : err,
    )
  }
}
