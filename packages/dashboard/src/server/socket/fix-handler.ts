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

function readRemotePr(ocrDir: string, sessionId: string): RemotePrMeta | null {
  const p = join(ocrDir, 'sessions', sessionId, 'remote-pr.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as RemotePrMeta
  } catch {
    return null
  }
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
