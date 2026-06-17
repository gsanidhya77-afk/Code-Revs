/**
 * Markdown artifact content endpoints.
 */

import { Router } from 'express'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from '@open-code-review/persistence'
import { getSession, getArtifact } from '../db.js'

const VALID_ARTIFACT_TYPES = new Set([
  'context',
  'discovered-standards',
  'discourse',
  'final',
  'final-human',
  'map',
  'flow-analysis',
  'topology',
  'requirements-mapping',
])

// Artifacts that live inside a round subdirectory
const ROUND_ARTIFACTS = new Set(['final', 'final-human', 'discourse'])
// Artifacts that live inside a map run subdirectory
const MAP_ARTIFACTS = new Set(['map', 'flow-analysis', 'topology', 'requirements-mapping'])

/**
 * Read an artifact directly from disk when it hasn't been persisted to SQLite.
 * This happens when the OCR skill writes final.md but the `ocr state
 * complete-round` step didn't run (e.g. the review was done interactively via
 * the AI assistant without the CLI state machine).
 */
function readArtifactFromDisk(
  ocrDir: string,
  sessionId: string,
  artifactType: string,
): string | null {
  const sessionDir = join(ocrDir, 'sessions', sessionId)
  if (!existsSync(sessionDir)) return null

  if (ROUND_ARTIFACTS.has(artifactType)) {
    const roundsDir = join(sessionDir, 'rounds')
    if (!existsSync(roundsDir)) return null
    // Walk round dirs newest-first (round-2 before round-1)
    const roundDirs = readdirSync(roundsDir)
      .filter((d) => /^round-\d+$/.test(d))
      .sort((a, b) => parseInt(b.split('-')[1]) - parseInt(a.split('-')[1]))
    for (const dir of roundDirs) {
      const filePath = join(roundsDir, dir, `${artifactType}.md`)
      if (existsSync(filePath)) return readFileSync(filePath, 'utf-8')
    }
    return null
  }

  if (MAP_ARTIFACTS.has(artifactType)) {
    const mapsDir = join(sessionDir, 'maps')
    if (!existsSync(mapsDir)) return null
    const runDirs = readdirSync(mapsDir)
      .filter((d) => /^run-\d+$/.test(d))
      .sort((a, b) => parseInt(b.split('-')[1]) - parseInt(a.split('-')[1]))
    for (const dir of runDirs) {
      const filePath = join(mapsDir, dir, `${artifactType}.md`)
      if (existsSync(filePath)) return readFileSync(filePath, 'utf-8')
    }
    return null
  }

  // Session-level artifact (context, discovered-standards, requirements)
  const filePath = join(sessionDir, `${artifactType}.md`)
  return existsSync(filePath) ? readFileSync(filePath, 'utf-8') : null
}

export function createArtifactsRouter(db: Database, ocrDir: string): Router {
  const router = Router()

  // GET /api/sessions/:id/artifacts/:type — Get markdown artifact content
  router.get('/:id/artifacts/:type', (req, res) => {
    try {
      const sessionId = req.params['id'] as string
      const artifactType = req.params['type'] as string

      if (!VALID_ARTIFACT_TYPES.has(artifactType)) {
        res.status(400).json({
          error: 'Invalid artifact type',
          valid_types: [...VALID_ARTIFACT_TYPES],
        })
        return
      }

      const session = getSession(db, sessionId)
      if (!session) {
        res.status(404).json({ error: 'Session not found' })
        return
      }

      const artifact = getArtifact(db, sessionId, artifactType)
      if (artifact) {
        res.json(artifact)
        return
      }

      // DB miss — fall back to reading the file directly from the session directory.
      const content = readArtifactFromDisk(ocrDir, sessionId, artifactType)
      if (content) {
        res.json({
          id: 0,
          session_id: sessionId,
          artifact_type: artifactType,
          round_number: null,
          file_path: '',
          content,
          parsed_at: new Date().toISOString(),
        })
        return
      }

      res.status(404).json({ error: 'Artifact not found' })
    } catch (err) {
      console.error('Failed to fetch artifact:', err)
      res.status(500).json({ error: 'Failed to fetch artifact' })
    }
  })

  return router
}
