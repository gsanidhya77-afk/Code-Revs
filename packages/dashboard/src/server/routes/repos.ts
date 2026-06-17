/**
 * Connected repositories registry — local paths + remote GitHub PRs.
 *
 * Both types are stored in ~/.ocr-repos.json so the list is global.
 * Remote PR entries are validated against the GitHub API at read-time
 * so their status stays accurate without needing a separate sync job.
 */

import { Router } from 'express'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, basename, dirname } from 'node:path'
import { parsePrUrl } from '../services/remote-pr-service.js'
import { remoteSessionId } from '../services/virtual-session.js'

const REGISTRY_PATH = join(homedir(), '.ocr-repos.json')

// ── Registry types ──

export type LocalRepoEntry = {
  type: 'local'
  path: string
  addedAt: string
}

export type RemotePrEntry = {
  type: 'remote'
  prUrl: string
  owner: string
  repo: string
  prNumber: number
  title: string
  addedAt: string
}

export type RepoEntry = LocalRepoEntry | RemotePrEntry

type Registry = {
  repos: RepoEntry[]
}

// ── Registry I/O ──

function readRegistry(): Registry {
  try {
    if (!existsSync(REGISTRY_PATH)) return { repos: [] }
    const raw = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8')) as Registry
    // Back-compat: entries without a type field are local repos
    return {
      repos: raw.repos.map((r: RepoEntry) =>
        'type' in r ? r : { ...r, type: 'local' } as LocalRepoEntry
      ),
    }
  } catch {
    return { repos: [] }
  }
}

function writeRegistry(registry: Registry): void {
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2))
}

// ── Enrichment ──

function enrichLocal(entry: LocalRepoEntry, currentProjectRoot: string) {
  return {
    type: 'local' as const,
    path: entry.path,
    name: basename(entry.path),
    addedAt: entry.addedAt,
    hasOcr: existsSync(join(entry.path, '.ocr')),
    isActive: entry.path === currentProjectRoot,
  }
}

function enrichRemote(entry: RemotePrEntry, ocrDir: string) {
  const sessionId = remoteSessionId(entry.owner, entry.repo, entry.prNumber)
  const sessionDir = join(ocrDir, 'sessions', sessionId)
  const hasReview = existsSync(join(sessionDir, 'rounds', 'round-1', 'final.md'))
  return {
    type: 'remote' as const,
    prUrl: entry.prUrl,
    owner: entry.owner,
    repo: entry.repo,
    prNumber: entry.prNumber,
    title: entry.title,
    addedAt: entry.addedAt,
    sessionId,
    hasReview,
  }
}

// ── Router ──

export function createReposRouter(ocrDir: string): Router {
  const router = Router()
  const currentProjectRoot = dirname(ocrDir)

  // GET /api/repos — list local + remote
  router.get('/', (_req, res) => {
    const { repos } = readRegistry()

    // Always include the current repo
    const localEntries = repos.filter((r): r is LocalRepoEntry => r.type === 'local')
    const remoteEntries = repos.filter((r): r is RemotePrEntry => r.type === 'remote')

    const paths = new Set(localEntries.map((r) => r.path))
    const allLocal: LocalRepoEntry[] = paths.has(currentProjectRoot)
      ? localEntries
      : [{ type: 'local', path: currentProjectRoot, addedAt: new Date().toISOString() }, ...localEntries]

    res.json({
      local: allLocal.map((e) => enrichLocal(e, currentProjectRoot)),
      remote: remoteEntries.map((e) => enrichRemote(e, ocrDir)),
    })
  })

  // POST /api/repos — add local repo { path }
  router.post('/', (req, res) => {
    const { path: repoPath } = req.body as { path?: string }
    if (!repoPath || typeof repoPath !== 'string') {
      res.status(400).json({ error: 'path is required' })
      return
    }
    const normalized = repoPath.trim().replace(/\/$/, '')
    if (!existsSync(normalized)) {
      res.status(400).json({ error: 'Path does not exist' })
      return
    }
    const registry = readRegistry()
    const already = registry.repos.some(
      (r) => r.type === 'local' && r.path === normalized
    )
    if (already) {
      res.status(409).json({ error: 'Repository already connected' })
      return
    }
    const entry: LocalRepoEntry = { type: 'local', path: normalized, addedAt: new Date().toISOString() }
    registry.repos.push(entry)
    writeRegistry(registry)
    res.status(201).json(enrichLocal(entry, currentProjectRoot))
  })

  // DELETE /api/repos — remove local repo { path }
  router.delete('/', (req, res) => {
    const { path: repoPath } = req.body as { path?: string }
    if (!repoPath || typeof repoPath !== 'string') {
      res.status(400).json({ error: 'path is required' })
      return
    }
    if (repoPath === currentProjectRoot) {
      res.status(400).json({ error: 'Cannot remove the currently active repository' })
      return
    }
    const registry = readRegistry()
    const before = registry.repos.length
    registry.repos = registry.repos.filter(
      (r) => !(r.type === 'local' && r.path === repoPath)
    )
    if (registry.repos.length === before) {
      res.status(404).json({ error: 'Repository not found' })
      return
    }
    writeRegistry(registry)
    res.status(200).json({ removed: repoPath })
  })

  // POST /api/repos/remote — validate + add remote PR { prUrl, title }
  router.post('/remote', (req, res) => {
    const { prUrl, title } = req.body as { prUrl?: string; title?: string }
    if (!prUrl || typeof prUrl !== 'string') {
      res.status(400).json({ error: 'prUrl is required' })
      return
    }
    const parsed = parsePrUrl(prUrl)
    if (!parsed) {
      res.status(400).json({ error: 'Invalid GitHub PR URL. Expected: https://github.com/owner/repo/pull/N' })
      return
    }
    const registry = readRegistry()
    const already = registry.repos.some(
      (r) => r.type === 'remote' && r.prUrl === prUrl.trim()
    )
    if (already) {
      res.status(409).json({ error: 'PR already added' })
      return
    }
    const entry: RemotePrEntry = {
      type: 'remote',
      prUrl: prUrl.trim(),
      owner: parsed.owner,
      repo: parsed.repo,
      prNumber: parsed.prNumber,
      title: (title ?? '').trim() || `${parsed.owner}/${parsed.repo}#${parsed.prNumber}`,
      addedAt: new Date().toISOString(),
    }
    registry.repos.push(entry)
    writeRegistry(registry)
    res.status(201).json(enrichRemote(entry, ocrDir))
  })

  // DELETE /api/repos/remote — remove remote PR { prUrl }
  router.delete('/remote', (req, res) => {
    const { prUrl } = req.body as { prUrl?: string }
    if (!prUrl || typeof prUrl !== 'string') {
      res.status(400).json({ error: 'prUrl is required' })
      return
    }
    const registry = readRegistry()
    const before = registry.repos.length
    registry.repos = registry.repos.filter(
      (r) => !(r.type === 'remote' && r.prUrl === prUrl)
    )
    if (registry.repos.length === before) {
      res.status(404).json({ error: 'PR not found' })
      return
    }
    writeRegistry(registry)
    res.status(200).json({ removed: prUrl })
  })

  return router
}
