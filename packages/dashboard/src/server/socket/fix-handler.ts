/**
 * Socket.IO fix-with-author-agent handler.
 *
 * Handles post-agent actions:
 *   fix:session-info — returns whether the session is a remote PR + branch info
 *   fix:diff         — git diff HEAD (local sessions only)
 *   fix:commit       — git add -A + commit + push (local sessions only)
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import { execBinaryAsync } from '@open-code-review/platform'
import { cleanEnv } from './env.js'

type RemotePrMeta = {
  prUrl: string
  owner: string
  repo: string
  prNumber: number
  headRef?: string
}

/**
 * Read remote PR metadata for a session, handling multiple sources and field-name
 * conventions that exist across the dashboard and CLI-agent review paths.
 *
 * Priority:
 *   1. remote-pr.json (dashboard format: prUrl/owner/repo/prNumber/headRef)
 *   2. remote-pr.json (agent format:     url/number/repo/branch  or  repo/pr_number/head_ref)
 *   3. context.md     (**Target** / **Branch** lines — always written by agent reviews)
 */
function readRemotePr(ocrDir: string, sessionId: string): RemotePrMeta | null {
  const p = join(ocrDir, 'sessions', sessionId, 'remote-pr.json')
  if (existsSync(p)) {
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>

      const prUrl = (raw.prUrl ?? raw.url) as string | undefined
      const prNumber = (raw.prNumber ?? raw.number ?? raw.pr_number) as number | undefined
      const headRef = (raw.headRef ?? raw.branch ?? raw.head_ref) as string | undefined
      const rawRepo = raw.repo as string | undefined

      let owner = raw.owner as string | undefined
      let repo = rawRepo
      if (!owner && rawRepo?.includes('/')) {
        const idx = rawRepo.indexOf('/')
        owner = rawRepo.slice(0, idx)
        repo = rawRepo.slice(idx + 1)
      }

      if (owner && repo && prNumber != null) {
        const resolvedUrl = prUrl ?? `https://github.com/${owner}/${repo}/pull/${prNumber}`
        return { prUrl: resolvedUrl, owner, repo, prNumber, headRef }
      }
    } catch {
      // fall through to context.md
    }
  }

  // Fall back: parse **Target** / **Branch** from context.md (written by agent reviews)
  const ctxPath = join(ocrDir, 'sessions', sessionId, 'context.md')
  if (existsSync(ctxPath)) {
    try {
      const ctx = readFileSync(ctxPath, 'utf-8')
      const urlMatch = /\*\*Target\*\*:\s*(https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+))/m.exec(ctx)
      if (urlMatch) {
        const [, prUrl, owner, repo, prNumberStr] = urlMatch
        const branchMatch = /\*\*Branch\*\*:\s*(.+)/.exec(ctx)
        const headRef = branchMatch
          ? branchMatch[1].split(/\s*(?:→|->)\s*/)[0].trim() || undefined
          : undefined
        return { prUrl, owner, repo, prNumber: parseInt(prNumberStr, 10), headRef }
      }
    } catch {
      // ignore
    }
  }

  return null
}

export function registerFixHandlers(
  _io: SocketIOServer,
  socket: Socket,
  ocrDir: string,
): void {
  const projectRoot = dirname(ocrDir)

  // ── fix:session-info — tells the client whether a session is a remote PR ──
  socket.on('fix:session-info', async (payload: { sessionId: string }) => {
    const meta = readRemotePr(ocrDir, payload?.sessionId ?? '')
    if (!meta) {
      socket.emit('fix:session-info-result', { isRemote: false })
      return
    }

    // Check if the authenticated gh user has push access to the repo.
    // gh api returns 200 + permission object for collaborators, 404 otherwise.
    let isCollaborator = false
    try {
      const env = cleanEnv()
      const { stdout: loginOut } = await execBinaryAsync(
        'gh', ['api', 'user', '--jq', '.login'],
        { env, encoding: 'utf-8', timeout: 8000 },
      )
      const login = loginOut.trim()
      if (login) {
        const { stdout: permOut } = await execBinaryAsync(
          'gh', [
            'api',
            `repos/${meta.owner}/${meta.repo}/collaborators/${login}/permission`,
            '--jq', '.permission',
          ],
          { env, encoding: 'utf-8', timeout: 8000 },
        ).catch(() => ({ stdout: 'none' }))
        const perm = permOut.trim()
        isCollaborator = perm === 'admin' || perm === 'write' || perm === 'maintain'
      }
    } catch {
      // Treat as non-collaborator if gh call fails
    }

    socket.emit('fix:session-info-result', {
      isRemote: true,
      isCollaborator,
      owner: meta.owner,
      repo: meta.repo,
      prNumber: meta.prNumber,
      headRef: meta.headRef ?? null,
      prUrl: meta.prUrl,
    })
  })

  // ── fix:diff — return git diff HEAD so the client can preview changes ──
  socket.on('fix:diff', async (payload?: { sessionId?: string }) => {
    // For remote PR sessions the agent pushes directly — no local diff
    if (payload?.sessionId) {
      const meta = readRemotePr(ocrDir, payload.sessionId)
      if (meta) {
        socket.emit('fix:diff-result', {
          diff: '',
          empty: true,
          remoteNote: `Changes were pushed directly to branch \`${meta.headRef ?? 'PR branch'}\` on ${meta.owner}/${meta.repo} — no local diff.`,
        })
        return
      }
    }

    const env = cleanEnv()
    try {
      const { stdout: statusOut } = await execBinaryAsync(
        'git', ['status', '--porcelain'],
        { cwd: projectRoot, env, encoding: 'utf-8' },
      )
      if (!statusOut.trim()) {
        socket.emit('fix:diff-result', { diff: '', empty: true })
        return
      }
      const { stdout: diffOut } = await execBinaryAsync(
        'git', ['diff', 'HEAD'],
        { cwd: projectRoot, env, encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 },
      )
      if (!diffOut.trim()) {
        const { stdout: fallback } = await execBinaryAsync(
          'git', ['diff'],
          { cwd: projectRoot, env, encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 },
        )
        socket.emit('fix:diff-result', { diff: fallback, empty: !fallback.trim() })
        return
      }
      socket.emit('fix:diff-result', { diff: diffOut, empty: false })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      socket.emit('fix:diff-result', { diff: '', empty: true, error: msg })
    }
  })

  // ── fix:commit — stage all, commit, push (local sessions only) ──
  socket.on('fix:commit', async (payload: { message: string; sessionId?: string }) => {
    const { message, sessionId } = payload ?? {}

    if (typeof message !== 'string' || !message.trim()) {
      socket.emit('fix:commit-result', { success: false, error: 'Commit message is required' })
      return
    }

    // Remote PR sessions: agent already pushed via gh api — nothing to commit locally
    if (sessionId) {
      const meta = readRemotePr(ocrDir, sessionId)
      if (meta) {
        socket.emit('fix:commit-result', {
          success: true,
          remote: true,
          prUrl: meta.prUrl,
          headRef: meta.headRef ?? null,
        })
        return
      }
    }

    const env = cleanEnv()
    try {
      await execBinaryAsync('git', ['add', '-A'], { cwd: projectRoot, env, encoding: 'utf-8' })

      const { stdout: statusOut } = await execBinaryAsync(
        'git', ['status', '--porcelain'],
        { cwd: projectRoot, env, encoding: 'utf-8' },
      )

      if (!statusOut.trim()) {
        // No uncommitted changes — check if there are unpushed commits to push
        const { stdout: aheadOut } = await execBinaryAsync(
          'git', ['rev-list', '--count', '@{u}..HEAD'],
          { cwd: projectRoot, env, encoding: 'utf-8' },
        ).catch(() => ({ stdout: '0' }))

        if (parseInt(aheadOut.trim(), 10) > 0) {
          // Agent already committed; just push
          await execBinaryAsync('git', ['push'], { cwd: projectRoot, env, encoding: 'utf-8' })
          const { stdout: hashOut } = await execBinaryAsync(
            'git', ['rev-parse', '--short', 'HEAD'],
            { cwd: projectRoot, env, encoding: 'utf-8' },
          )
          socket.emit('fix:commit-result', { success: true, commitHash: hashOut.trim() })
          return
        }

        socket.emit('fix:commit-result', {
          success: false,
          error: 'No changes to commit. Run the Author Agent first to apply the fix.',
        })
        return
      }

      await execBinaryAsync(
        'git', ['commit', '-m', message.trim()],
        { cwd: projectRoot, env, encoding: 'utf-8' },
      )

      const { stdout: hashOut } = await execBinaryAsync(
        'git', ['rev-parse', '--short', 'HEAD'],
        { cwd: projectRoot, env, encoding: 'utf-8' },
      )

      await execBinaryAsync('git', ['push'], { cwd: projectRoot, env, encoding: 'utf-8' })

      socket.emit('fix:commit-result', { success: true, commitHash: hashOut.trim() })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      socket.emit('fix:commit-result', { success: false, error: msg })
    }
  })
}
