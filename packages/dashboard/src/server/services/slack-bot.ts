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

import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { App, LogLevel } from '@slack/bolt'
import { execBinaryAsync } from '@open-code-review/platform'
import { SlackReviewStore } from './slack-review-store.js'
import type { AiCliService } from './ai-cli/index.js'
import { buildPrompt } from '../socket/prompt-builder.js'
import { resolveLocalCli } from '../socket/cli-resolver.js'
import { cleanEnv } from '../socket/env.js'

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
      console.log(`[slack-bot] app_mention received — user:${userId} channel:${channel} text:${text.slice(0, 80)}`)

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

      // ── Acknowledge in channel (visible to everyone) ──
      await this.post(channel, e.ts,
        `:mag: On it! Reviewing ${prLabel} now.\n${prUrl}\n• *Team:* \`${this.defaultTeam}\` • *Started:* ${fmtTime(startTime)}\nI'll DM <@${userId}> when the review is complete.`,
      )

      // ── DM requester too ──
      await this.dm(userId,
        `:mag: Review started for ${prLabel}\n${prUrl}\n\n• *Team:* \`${this.defaultTeam}\`\n• *Started:* ${fmtTime(startTime)}\n\nI'll DM you when the review is complete.`,
      )

      // ── Spawn review (fire-and-forget; completion detected via filesystem) ──
      this.spawnReview(prUrl, owner, repo, prNumber, userId).catch((err: unknown) => {
        console.error(`[slack-bot] spawn failed for ${prUrl}:`, err)
        this.store.remove(prUrl)
        void this.post(channel, e.ts,
          `:x: <@${userId}> Failed to start review for ${prLabel}. Make sure Claude Code is installed and \`ocr init\` has been run.`,
        )
        void this.dm(userId,
          `:x: Failed to start review for ${prLabel}. Make sure Claude Code is installed and \`ocr init\` has been run in this project.`,
        )
      })
    })
  }

  // ── Called by FilesystemSync when final.md is written ──

  async handleFinalMd(sessionDir: string, roundNumber: number): Promise<void> {
    let entry = this.store.getBySessionDir(sessionDir)

    if (!entry) {
      const meta = readRemotePrJson(sessionDir)
      if (meta?.prUrl) {
        entry = this.store.get(meta.prUrl)
        if (entry) this.store.linkSession(meta.prUrl, sessionDir)
      }
    }

    // Fallback: Claude Code may have reused an existing local session instead of
    // creating a new one for the remote PR (no remote-pr.json written). If exactly
    // one review is in flight, it must be this one — link it heuristically.
    if (!entry) {
      const active = this.store.all()
      if (active.length === 1) {
        entry = active[0]!
        this.store.linkSession(entry.prUrl, sessionDir)
        console.warn(`[slack-bot] heuristic session match: ${entry.prUrl} → ${sessionDir}`)
      }
    }

    if (!entry) return

    const endTime = new Date()
    const prLabel = `*${entry.prOwner}/${entry.prRepo}* PR #${entry.prNumber}`
    const duration = fmtDuration(entry.startTime.getTime(), endTime.getTime())

    // ── Notify in channel ──
    await this.post(entry.channelId, undefined,
      `:white_check_mark: Review complete for ${prLabel} (requested by <@${entry.slackUserId}>)\n${entry.prUrl}\n• *Duration:* ${duration} • *Started:* ${fmtTime(entry.startTime)} • *Finished:* ${fmtTime(endTime)}\n_Posting review to GitHub..._`,
    )

    // ── DM requester ──
    await this.dm(entry.slackUserId,
      `:white_check_mark: Review complete for ${prLabel}\n${entry.prUrl}\n\n• *Started:* ${fmtTime(entry.startTime)}\n• *Finished:* ${fmtTime(endTime)}\n• *Duration:* ${duration}\n\n_Posting to GitHub PR..._`,
    )

    // ── Auto-post to GitHub ──
    const commentUrl = await this.autoPostToGitHub(entry.prUrl, sessionDir, roundNumber)
    if (commentUrl) {
      await this.post(entry.channelId, undefined,
        `:github: Review posted to GitHub: ${commentUrl}`,
      )
      await this.dm(entry.slackUserId,
        `:github: Review posted to GitHub!\n${commentUrl}`,
      )
    } else {
      await this.dm(entry.slackUserId,
        `:warning: Could not auto-post to GitHub (check \`gh auth status\`). Use the *Post to GitHub* button in the dashboard instead.`,
      )
    }

    this.store.remove(entry.prUrl)
  }

  // ── GitHub auto-poster ──

  private async autoPostToGitHub(prUrl: string, sessionDir: string, roundNumber: number): Promise<string | null> {
    // Prefer human-translated review, fall back to raw final.md
    const roundDir = join(sessionDir, 'rounds', `round-${roundNumber}`)
    const humanPath = join(roundDir, 'final-human.md')
    const finalPath = join(roundDir, 'final.md')
    const contentPath = existsSync(humanPath) ? humanPath : existsSync(finalPath) ? finalPath : null
    if (!contentPath) {
      console.warn(`[slack-bot] autoPostToGitHub: no review file found in ${roundDir}`)
      return null
    }

    const content = readFileSync(contentPath, 'utf-8')

    const tmpDir = join(tmpdir(), 'ocr-post-comments')
    try { mkdirSync(tmpDir, { recursive: true }) } catch { /* exists */ }
    const tmpFile = join(tmpDir, `${randomUUID()}.md`)
    writeFileSync(tmpFile, content)

    try {
      const { stdout } = await execBinaryAsync(
        'gh',
        ['pr', 'comment', prUrl, '--body-file', tmpFile],
        { env: cleanEnv(), cwd: dirname(this.ocrDir), encoding: 'utf-8' },
      )
      return stdout.match(/(https:\/\/github\.com\S+)/)?.[0] ?? prUrl
    } catch (err) {
      console.error('[slack-bot] GitHub post failed:', err)
      return null
    } finally {
      try { unlinkSync(tmpFile) } catch { /* ignore */ }
    }
  }

  // ── Review spawner ──

  private async spawnReview(prUrl: string, owner: string, repo: string, prNumber: number, userId: string): Promise<void> {
    const adapter = this.aiCliService.getAdapter()
    if (!adapter) throw new Error('No AI CLI adapter available (install Claude Code or OpenCode)')

    // Pre-fetch the PR's head branch so we can create the correct session dir
    // before Claude Code runs — ensures handleFinalMd can always find the store entry
    // even if the underlying CLI reuses an existing local session.
    let headRef = `${repo}-pr-${prNumber}`
    try {
      const { stdout } = await execBinaryAsync('gh', ['pr', 'view', prUrl, '--json', 'headRefName'], {
        env: cleanEnv(), encoding: 'utf-8',
      })
      const parsed = JSON.parse(stdout) as { headRefName?: string }
      if (parsed.headRefName) headRef = parsed.headRefName
    } catch { /* keep default */ }

    // Pre-create session dir + remote-pr.json so FilesystemSync can match this
    // review to the store entry the moment final.md is written.
    const today = new Date().toISOString().split('T')[0]!
    const safeRef = headRef.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-{2,}/g, '-').slice(0, 60)
    const expectedSessionId = `${today}-${safeRef}`
    const expectedSessionDir = join(this.ocrDir, 'sessions', expectedSessionId)
    try {
      mkdirSync(expectedSessionDir, { recursive: true })
      writeFileSync(
        join(expectedSessionDir, 'remote-pr.json'),
        JSON.stringify({ prUrl, owner, repo, prNumber, headRef }),
      )
      this.store.linkSession(prUrl, expectedSessionDir)
      console.log(`[slack-bot] pre-created session: ${expectedSessionId}`)
    } catch (err) {
      console.warn(`[slack-bot] could not pre-create session dir:`, err)
    }

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

    // Drain stdout/stderr — the Slack bot never reads Claude Code's stream-json
    // output, so without this the OS pipe buffer (~64 KB) fills and the subprocess
    // blocks mid-workflow (low-CPU hang, no session files created).
    result.process.stdout?.resume()
    result.process.stderr?.resume()

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
