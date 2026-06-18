/**
 * Slack bot for Open Code Review — Socket Mode (no public URL required).
 *
 * Trigger:  @ocr-bot https://github.com/owner/repo/pull/123
 *
 * Behaviour:
 *   - DM requester on review start with PR details + start time
 *   - DM requester on review complete with start/finish time + duration
 *   - If another user requests the same PR while one review is running,
 *     DM BOTH: original user ("someone else also requested this") and
 *     new user ("already in progress by @original, started at X")
 *
 * Config (.ocr/config.yaml):
 *   slack:
 *     bot_token: "xoxb-..."   # Bot User OAuth Token
 *     app_token: "xapp-..."   # App-Level Token (for Socket Mode)
 *     default_team: "principal:2,security:1"   # optional
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { App, LogLevel } from '@slack/bolt'
import { SlackReviewStore } from './slack-review-store.js'
import type { AiCliService } from './ai-cli/index.js'
import { buildPrompt } from '../socket/prompt-builder.js'
import { resolveLocalCli } from '../socket/cli-resolver.js'

// ── Public config type (read from config.yaml slack: block) ──

export type SlackConfig = {
  bot_token: string
  app_token: string
  default_team?: string
}

// ── Helpers ──

const PR_URL_RE = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i

function parsePrUrl(text: string): { owner: string; repo: string; prNumber: number; prUrl: string } | null {
  const m = PR_URL_RE.exec(text)
  if (!m) return null
  return { owner: m[1]!, repo: m[2]!, prNumber: parseInt(m[3]!, 10), prUrl: m[0] }
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(startMs: number, endMs: number): string {
  const mins = Math.round((endMs - startMs) / 60_000)
  return mins < 1 ? 'under a minute' : `${mins} min`
}

type RemotePrJson = { prUrl: string; owner: string; repo: string; prNumber: number; headRef: string }

function readRemotePrJson(sessionDir: string): RemotePrJson | null {
  const p = join(sessionDir, 'remote-pr.json')
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf-8')) as RemotePrJson } catch { return null }
}

// ── SlackBot ──

export class SlackBot {
  private app: App
  private store = new SlackReviewStore()
  private ocrDir: string
  private aiCliService: AiCliService
  private defaultTeam: string

  constructor(config: SlackConfig, ocrDir: string, aiCliService: AiCliService) {
    this.ocrDir = ocrDir
    this.aiCliService = aiCliService
    this.defaultTeam = config.default_team ?? 'principal:2,security:1'

    this.app = new App({
      token: config.bot_token,
      appToken: config.app_token,
      socketMode: true,
      logLevel: LogLevel.WARN,
    })

    this.registerHandlers()
  }

  // ── Event handlers ──

  private registerHandlers(): void {
    this.app.event('app_mention', async ({ event }) => {
      const e = event as { text?: string; user?: string; channel: string; ts?: string }
      const text    = e.text ?? ''
      const userId  = e.user ?? ''
      const channel = e.channel

      const parsed = parsePrUrl(text)
      if (!parsed) {
        await this.post(channel, e.ts,
          `Hi <@${userId}>! Mention me with a GitHub PR URL:\n\`@bot https://github.com/owner/repo/pull/123\``,
        )
        return
      }

      const { owner, repo, prNumber, prUrl } = parsed
      const prLabel = `*${owner}/${repo}* PR #${prNumber}`
      const startTime = new Date()

      // ── Duplicate detection ──
      const existing = this.store.get(prUrl)
      if (existing) {
        await this.dm(userId,
          `:hourglass_flowing_sand: ${prLabel} is already being reviewed — started by <@${existing.slackUserId}> at ${fmtTime(existing.startTime)}. You'll be notified when it completes.`,
        )
        await this.dm(existing.slackUserId,
          `:eyes: <@${userId}> also requested a review of ${prLabel} (${prUrl}). Your review is still running (started ${fmtTime(existing.startTime)}).`,
        )
        return
      }

      // ── Track ──
      this.store.track({ prUrl, prOwner: owner, prRepo: repo, prNumber, slackUserId: userId, channelId: channel, startTime })

      // ── Acknowledge ──
      await this.dm(userId,
        `:mag: Review started for ${prLabel}\n${prUrl}\n\n• *Team:* \`${this.defaultTeam}\`\n• *Started:* ${fmtTime(startTime)}\n\nI'll DM you when the review is complete.`,
      )

      // ── Spawn review (fire-and-forget; completion detected via filesystem) ──
      this.spawnReview(prUrl, owner, repo, prNumber, userId).catch((err: unknown) => {
        console.error(`[slack-bot] spawn failed for ${prUrl}:`, err)
        this.store.remove(prUrl)
        void this.dm(userId,
          `:x: Failed to start review for ${prLabel}. Make sure Claude Code is installed and \`ocr init\` has been run in this project.`,
        )
      })
    })
  }

  // ── Called by FilesystemSync when final.md is written ──

  async handleFinalMd(sessionDir: string, _roundNumber: number): Promise<void> {
    let entry = this.store.getBySessionDir(sessionDir)

    if (!entry) {
      const meta = readRemotePrJson(sessionDir)
      if (!meta) return
      entry = this.store.get(meta.prUrl)
      if (!entry) return
      this.store.linkSession(meta.prUrl, sessionDir)
    }

    const endTime = new Date()
    const prLabel = `*${entry.prOwner}/${entry.prRepo}* PR #${entry.prNumber}`
    const duration = fmtDuration(entry.startTime.getTime(), endTime.getTime())

    await this.dm(entry.slackUserId,
      `:white_check_mark: Review complete for ${prLabel}\n${entry.prUrl}\n\n• *Started:* ${fmtTime(entry.startTime)}\n• *Finished:* ${fmtTime(endTime)}\n• *Duration:* ${duration}`,
    )

    this.store.remove(entry.prUrl)
  }

  // ── Review spawner ──

  private async spawnReview(prUrl: string, owner: string, repo: string, prNumber: number, userId: string): Promise<void> {
    const adapter = this.aiCliService.getAdapter()
    if (!adapter) throw new Error('No AI CLI adapter available (install Claude Code or OpenCode)')

    const commandContent = this.readCommandFile('review')
    const localCli = resolveLocalCli(this.ocrDir)

    const { prompt } = buildPrompt({
      baseCommand: 'review',
      subArgs: ['--remote', prUrl, '--team', this.defaultTeam],
      commandContent,
      executionUid: null,
      localCli,
    })

    // Start watching for the new session directory so we can link prUrl → sessionDir
    this.watchForNewSession(prUrl, owner, repo, prNumber)

    const result = adapter.spawn({
      prompt,
      cwd: process.cwd(),
      mode: 'workflow',
    })

    // Wait for the child process to exit — completion DM comes via handleFinalMd
    await new Promise<void>((resolve, reject) => {
      result.process.on('close', (code) => {
        if (code === 0 || code === null) resolve()
        else reject(new Error(`AI CLI exited with code ${code}`))
      })
      result.process.on('error', reject)
    })

    // Safety net: if final.md was never written (e.g. review failed silently)
    // clean up the tracked entry after exit so we don't leak memory
    if (this.store.get(prUrl)) {
      console.warn(`[slack-bot] review process exited but no final.md detected for ${prUrl}`)
      void this.dm(userId,
        `:warning: The review process for *${owner}/${repo}* PR #${prNumber} exited without producing a result. Please check your AI CLI setup and try again.`,
      )
      this.store.remove(prUrl)
    }
  }

  private readCommandFile(command: string): string {
    const candidates = [
      join(this.ocrDir, 'commands', `${command}.md`),
      join(process.cwd(), '.claude', 'commands', 'ocr', `${command}.md`),
    ]
    for (const p of candidates) {
      if (existsSync(p)) return readFileSync(p, 'utf-8')
    }
    return `Run the OCR review workflow for the remote PR specified in the arguments.`
  }

  /** Poll the sessions dir (max 5 min) to find the new session created for this PR. */
  private watchForNewSession(prUrl: string, owner: string, repo: string, prNumber: number): void {
    const sessionsDir = join(this.ocrDir, 'sessions')
    let attempts = 0
    const timer = setInterval(() => {
      attempts++
      if (attempts > 60 || !this.store.get(prUrl)) { clearInterval(timer); return }
      try {
        for (const dirent of readdirSync(sessionsDir, { withFileTypes: true })) {
          if (!dirent.isDirectory()) continue
          const sessionDir = join(sessionsDir, dirent.name)
          const meta = readRemotePrJson(sessionDir)
          if (meta && meta.owner === owner && meta.repo === repo && meta.prNumber === prNumber) {
            this.store.linkSession(prUrl, sessionDir)
            clearInterval(timer)
            return
          }
        }
      } catch { /* sessions dir may not exist yet */ }
    }, 5_000)
    timer.unref()
  }

  // ── Messaging helpers ──

  private async dm(userId: string, text: string): Promise<void> {
    try {
      await this.app.client.chat.postMessage({ channel: userId, text })
    } catch (err) {
      console.error('[slack-bot] DM failed to', userId, ':', err)
    }
  }

  private async post(channel: string, threadTs: string | undefined, text: string): Promise<void> {
    try {
      await this.app.client.chat.postMessage({ channel, text, ...(threadTs ? { thread_ts: threadTs } : {}) })
    } catch (err) {
      console.error('[slack-bot] post failed:', err)
    }
  }

  // ── Lifecycle ──

  async start(): Promise<void> {
    await this.app.start()
    console.log('  Slack bot:         connected (Socket Mode)')
  }

  async stop(): Promise<void> {
    await this.app.stop()
  }
}
