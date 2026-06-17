/**
 * Creates a virtual OCR session directory for a remote GitHub PR.
 *
 * Stores sessions inside the active ocrDir/sessions/ so the existing
 * filesystem sync, artifact disk-fallback, and dashboard UI all pick
 * them up without any extra configuration.
 *
 * Session ID format:  {YYYY-MM-DD}-{owner}-{repo}-pr{number}
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PrMeta } from './remote-pr-service.js'

export type VirtualSession = {
  sessionId: string
  sessionDir: string
  roundDir: string
  diffPath: string
  contextPath: string
}

export function remoteSessionId(
  owner: string,
  repo: string,
  prNumber: number,
  date?: string,
): string {
  const d = date ?? new Date().toISOString().slice(0, 10)
  // Sanitise: lowercase, replace non-alphanumeric runs with hyphens
  const safeName = `${owner}-${repo}-pr${prNumber}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
  return `${d}-${safeName}`
}

export function createVirtualSession(
  ocrDir: string,
  meta: PrMeta,
  contextMd: string,
  diff: string,
): VirtualSession {
  const sessionId = remoteSessionId(meta.owner, meta.repo, meta.prNumber)
  const sessionDir = join(ocrDir, 'sessions', sessionId)
  const roundDir = join(sessionDir, 'rounds', 'round-1')
  const diffPath = join(sessionDir, 'pr.diff')
  const contextPath = join(sessionDir, 'context.md')

  // Create directory scaffold
  mkdirSync(join(roundDir, 'reviews'), { recursive: true })

  // Write context and diff
  writeFileSync(contextPath, contextMd, 'utf-8')
  writeFileSync(diffPath, diff, 'utf-8')

  // Write a minimal requirements.md from the PR description
  if (meta.body.trim()) {
    writeFileSync(
      join(sessionDir, 'requirements.md'),
      `# Requirements (from PR description)\n\n${meta.body}`,
      'utf-8',
    )
  }

  return { sessionId, sessionDir, roundDir, diffPath, contextPath }
}

export function writeReviewResult(roundDir: string, content: string): void {
  mkdirSync(roundDir, { recursive: true })
  writeFileSync(join(roundDir, 'final.md'), content, 'utf-8')
}

export function readFinalMd(roundDir: string): string | null {
  const p = join(roundDir, 'final.md')
  return existsSync(p) ? readFileSync(p, 'utf-8') : null
}

/** Build the OCR review prompt for a remote PR diff. */
export function buildReviewPrompt(
  skillMd: string,
  meta: PrMeta,
  contextMd: string,
  diff: string,
): string {
  const diffPreview =
    diff.length > 80000
      ? diff.slice(0, 80000) + '\n\n[...diff truncated at 80k chars...]'
      : diff

  return `${skillMd}

---

## Remote PR Review Mode

You are reviewing a remote GitHub PR. There is no local git repository.
Use the diff provided below instead of running \`git diff\`.
Save your final synthesised review as \`rounds/round-1/final.md\` in the session directory.

${contextMd}

## Diff

\`\`\`diff
${diffPreview}
\`\`\`

Begin the review now following the 8-phase OCR workflow above.
`
}
