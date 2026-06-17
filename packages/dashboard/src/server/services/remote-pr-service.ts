/**
 * Fetches GitHub PR metadata and diff via the gh CLI.
 * No local clone required — works for any public PR and any private
 * repo the authenticated gh token has access to.
 */

import { execBinary } from '@open-code-review/platform'

export type PrMeta = {
  owner: string
  repo: string
  prNumber: number
  title: string
  body: string
  author: string
  headRef: string
  baseRef: string
  url: string
  state: string
  changedFiles: number
  additions: number
  deletions: number
  labels: string[]
}

export type ParsedPrUrl = {
  owner: string
  repo: string
  prNumber: number
}

export function parsePrUrl(url: string): ParsedPrUrl | null {
  const m = url
    .trim()
    .match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)/)
  if (!m || !m[1] || !m[2] || !m[3]) return null
  return { owner: m[1], repo: m[2], prNumber: parseInt(m[3], 10) }
}

export async function fetchPrMeta(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PrMeta> {
  const fields = [
    'title',
    'body',
    'number',
    'author',
    'headRefName',
    'baseRefName',
    'url',
    'state',
    'changedFiles',
    'additions',
    'deletions',
    'labels',
  ].join(',')

  const raw = execBinary(
    'gh',
    ['pr', 'view', String(prNumber), '--repo', `${owner}/${repo}`, '--json', fields],
    { encoding: 'utf-8', timeout: 15000 },
  )

  const data = JSON.parse(raw) as {
    title: string
    body: string
    number: number
    author: { login: string }
    headRefName: string
    baseRefName: string
    url: string
    state: string
    changedFiles: number
    additions: number
    deletions: number
    labels: { name: string }[]
  }

  return {
    owner,
    repo,
    prNumber: data.number,
    title: data.title ?? '',
    body: data.body ?? '',
    author: data.author?.login ?? '',
    headRef: data.headRefName ?? '',
    baseRef: data.baseRefName ?? '',
    url: data.url ?? '',
    state: data.state ?? '',
    changedFiles: data.changedFiles ?? 0,
    additions: data.additions ?? 0,
    deletions: data.deletions ?? 0,
    labels: (data.labels ?? []).map((l) => l.name),
  }
}

export async function fetchPrDiff(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  return execBinary(
    'gh',
    ['pr', 'diff', String(prNumber), '--repo', `${owner}/${repo}`],
    { encoding: 'utf-8', timeout: 30000 },
  )
}

export function buildContextMd(meta: PrMeta): string {
  const labelLine =
    meta.labels.length > 0 ? `**Labels**: ${meta.labels.join(', ')}\n` : ''
  return `# PR Context: ${meta.title}

**PR**: [${meta.owner}/${meta.repo}#${meta.prNumber}](${meta.url})
**Author**: @${meta.author}
**Branch**: \`${meta.headRef}\` → \`${meta.baseRef}\`
**State**: ${meta.state}
${labelLine}**Changes**: ${meta.changedFiles} files  +${meta.additions} / -${meta.deletions}

## Description

${meta.body || '_No description provided._'}
`
}
