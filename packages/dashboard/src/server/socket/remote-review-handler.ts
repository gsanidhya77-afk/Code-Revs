/**
 * Socket handler for remote GitHub PR reviews.
 *
 * Events (client → server):
 *   remote-review:start   { prUrl }           — fetch diff + run OCR
 *   remote-review:cancel  { prUrl }           — abort in-flight review
 *
 * Events (server → client):
 *   remote-review:phase   { prUrl, phase }    — phase label update
 *   remote-review:token   { prUrl, token }    — streamed text token
 *   remote-review:done    { prUrl, sessionId }— review written to disk
 *   remote-review:error   { prUrl, error }    — something failed
 */

import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import {
  AiCliService,
  formatToolDetail,
  type NormalizedEvent,
} from '../services/ai-cli/index.js'
import {
  fetchPrMeta,
  fetchPrDiff,
  buildContextMd,
} from '../services/remote-pr-service.js'
import {
  createVirtualSession,
  writeReviewResult,
  buildReviewPrompt,
} from '../services/virtual-session.js'
import { cleanEnv } from './env.js'

const activeReviews = new Map<string, ChildProcess>()

export function registerRemoteReviewHandlers(
  _io: SocketIOServer,
  socket: Socket,
  ocrDir: string,
  aiCliService: AiCliService,
): void {

  socket.on('remote-review:start', async (payload: { prUrl?: string }) => {
    const prUrl = payload?.prUrl
    if (!prUrl || typeof prUrl !== 'string') {
      socket.emit('remote-review:error', { prUrl: prUrl ?? '', error: 'prUrl is required' })
      return
    }

    if (activeReviews.has(prUrl)) {
      socket.emit('remote-review:error', { prUrl, error: 'A review for this PR is already running' })
      return
    }

    const emit = (event: string, data: Record<string, unknown>) =>
      socket.emit(event, { prUrl, ...data })

    try {
      // ── Phase 1: Fetch PR data ──
      emit('remote-review:phase', { phase: 'Fetching PR metadata…' })
      const { owner, repo, prNumber } = parsePrUrlSimple(prUrl)

      let meta, diff: string
      try {
        meta = await fetchPrMeta(owner, repo, prNumber)
        emit('remote-review:phase', { phase: 'Fetching diff…' })
        diff = await fetchPrDiff(owner, repo, prNumber)
      } catch (e: unknown) {
        emit('remote-review:error', {
          error: `Could not fetch PR from GitHub: ${(e as Error).message}. Make sure gh is authenticated and the PR is accessible.`,
        })
        return
      }

      // ── Phase 2: Create virtual session ──
      emit('remote-review:phase', { phase: 'Creating review session…' })
      const contextMd = buildContextMd(meta)
      const session = createVirtualSession(ocrDir, meta, contextMd, diff)

      // ── Phase 3: Load OCR skill ──
      const skillPath = join(ocrDir, 'skills', 'SKILL.md')
      if (!existsSync(skillPath)) {
        emit('remote-review:error', { error: `OCR skill not found at ${skillPath}. Run \`ocr init\` first.` })
        return
      }
      const skillMd = readFileSync(skillPath, 'utf-8')

      // ── Phase 4: Check AI CLI ──
      const adapter = aiCliService.getAdapter()
      if (!adapter) {
        emit('remote-review:error', { error: 'No AI CLI available. Install Claude Code or OpenCode.' })
        return
      }

      // ── Phase 5: Run review ──
      emit('remote-review:phase', { phase: 'Running OCR review (this takes a few minutes)…' })
      const prompt = buildReviewPrompt(skillMd, meta, contextMd, diff)

      const { process: proc } = adapter.spawn({
        prompt,
        cwd: session.sessionDir,
        mode: 'workflow',
        maxTurns: 60,
        env: cleanEnv(),
      })

      if (!proc.pid) {
        emit('remote-review:error', { error: 'Failed to spawn AI CLI process' })
        return
      }

      activeReviews.set(prUrl, proc)

      let fullText = ''
      const parser = adapter.createParser()

      const onData = (chunk: Buffer) => {
        const lines = chunk.toString().split('\n')
        for (const line of lines) {
          if (!line.trim()) continue
          const events: NormalizedEvent[] = parser.parseLine(line)
          for (const event of events) {
            if (event.type === 'text_delta') {
              fullText += event.text
              emit('remote-review:token', { token: event.text })
            } else if (event.type === 'tool_call') {
              emit('remote-review:phase', {
                phase: formatToolDetail(event.name, event.input),
              })
            } else if (event.type === 'error') {
              emit('remote-review:phase', { phase: `⚠ ${event.message}` })
            }
          }
        }
      }

      proc.stdout?.on('data', onData)
      proc.stderr?.on('data', onData)

      proc.on('close', (code) => {
        activeReviews.delete(prUrl)

        if (code !== 0 && !fullText.trim()) {
          emit('remote-review:error', { error: `AI process exited with code ${code}` })
          return
        }

        // Extract the review content — take everything from the first `#` heading
        const reviewContent = extractReviewContent(fullText)
        if (reviewContent) {
          writeReviewResult(session.roundDir, reviewContent)
        }

        emit('remote-review:done', { sessionId: session.sessionId })
      })

      proc.on('error', (err) => {
        activeReviews.delete(prUrl)
        emit('remote-review:error', { error: `Process error: ${err.message}` })
      })

    } catch (err: unknown) {
      activeReviews.delete(prUrl)
      emit('remote-review:error', { error: (err as Error).message ?? 'Unknown error' })
    }
  })

  socket.on('remote-review:cancel', (payload: { prUrl?: string }) => {
    const prUrl = payload?.prUrl
    if (!prUrl) return
    const proc = activeReviews.get(prUrl)
    if (proc) {
      proc.kill('SIGTERM')
      activeReviews.delete(prUrl)
      socket.emit('remote-review:error', { prUrl, error: 'Review cancelled' })
    }
  })
}

// ── Helpers ──

function parsePrUrlSimple(url: string): { owner: string; repo: string; prNumber: number } {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (!m || !m[1] || !m[2] || !m[3]) throw new Error(`Invalid PR URL: ${url}`)
  return { owner: m[1], repo: m[2], prNumber: parseInt(m[3], 10) }
}

function extractReviewContent(text: string): string {
  // Find the start of the OCR final.md — look for the standard OCR heading or verdict section
  const markers = [
    /^#\s+Code Review:/m,
    /^##\s+Verdict/m,
    /^\*\*(APPROVE|REQUEST CHANGES|NEEDS DISCUSSION)\*\*/m,
  ]
  for (const marker of markers) {
    const idx = text.search(marker)
    if (idx !== -1) return text.slice(idx).trim()
  }
  // Fallback: return everything after the last long separator
  const sep = text.lastIndexOf('---')
  return sep !== -1 ? text.slice(sep + 3).trim() : text.trim()
}
