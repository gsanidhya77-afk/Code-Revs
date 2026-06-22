import { useState, useMemo } from 'react'
import { Wrench } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { MarkdownRenderer } from '../../../components/markdown/markdown-renderer'
import { BatchFixDialog } from './batch-fix-dialog'
import type { Finding } from '../../../lib/api-types'

// ── Types ──────────────────────────────────────────────────────────────────

type SectionKind = 'blocker' | 'should-fix' | 'suggestion'

type Segment =
  | { type: 'md'; id: number; content: string }
  | { type: 'item'; id: number; kind: SectionKind; headingLine: string; bodyContent: string }

// ── Segmenter ──────────────────────────────────────────────────────────────

function buildSegments(markdown: string): Segment[] {
  const lines = markdown.split('\n')
  const segments: Segment[] = []
  let mdBuf: string[] = []
  let segId = 0
  let itemId = 0

  type ActiveItem = { kind: SectionKind; heading: string; bodyLines: string[] }
  let current: ActiveItem | null = null

  function flushMd() {
    if (mdBuf.length > 0) {
      segments.push({ type: 'md', id: segId++, content: mdBuf.join('\n') })
      mdBuf = []
    }
  }

  function flushItem() {
    if (current) {
      segments.push({
        type: 'item',
        id: itemId++,
        kind: current.kind,
        headingLine: current.heading,
        bodyContent: current.bodyLines.join('\n'),
      })
      current = null
      segId++
    }
  }

  for (const line of lines) {
    const isBlockerH   = /^###\s*[\u{1F6AB}]\s*\d+\./u.test(line)
    const isShouldFixH = !isBlockerH && /^###\s*\d+\.\s/.test(line)
    const isSuggBullet = /^- "/.test(line)
    const isNewSection = /^## /.test(line)

    if (isBlockerH || isShouldFixH) {
      flushMd()
      flushItem()
      current = {
        kind: isBlockerH ? 'blocker' : 'should-fix',
        heading: line,
        bodyLines: [],
      }
    } else if (isSuggBullet) {
      flushMd()
      flushItem()
      segments.push({ type: 'item', id: itemId++, kind: 'suggestion', headingLine: line, bodyContent: '' })
      segId++
    } else if (isNewSection) {
      flushMd()
      flushItem()
      mdBuf.push(line)
    } else {
      if (current) {
        current.bodyLines.push(line)
      } else {
        mdBuf.push(line)
      }
    }
  }

  flushMd()
  flushItem()

  return segments
}

// ── Helpers ────────────────────────────────────────────────────────────────

function tryLocMatch(text: string): { file: string; start: number } | null {
  const m = /([\w./\\-]+\.\w+):(\d+)/.exec(text)
  if (!m) return null
  return { file: m[1], start: parseInt(m[2], 10) }
}

function segmentToFinding(seg: Segment & { type: 'item' }): Finding {
  const fullText = seg.headingLine + '\n' + seg.bodyContent
  const loc = tryLocMatch(fullText.slice(0, 400))
  const title = seg.headingLine
    .replace(/^###\s*[\u{1F6AB}]\s*/u, '')
    .replace(/^###\s*/, '')
    .replace(/^- /, '')
    .trim()
    .slice(0, 200)
  return {
    id: -(seg.id + 1),
    session_id: '',
    round_id: 0,
    severity: seg.kind === 'blocker' ? 'critical' : seg.kind === 'should-fix' ? 'high' : 'medium',
    title,
    file_path: loc?.file ?? null,
    line_start: loc?.start ?? null,
    line_end: null,
    summary: fullText.slice(0, 600) || null,
    is_blocker: seg.kind === 'blocker',
    progress: null,
  } as unknown as Finding
}

const SEVERITY_BADGE: Record<SectionKind, string> = {
  blocker:    'bg-red-500/15 text-red-700 dark:text-red-400',
  'should-fix': 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  suggestion: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
}

const SEVERITY_LABEL: Record<SectionKind, string> = {
  blocker:    'Blocker',
  'should-fix': 'Should Fix',
  suggestion: 'Suggestion',
}

// ── Main component ─────────────────────────────────────────────────────────

export function FinalReviewWithFix({
  content,
  sessionId,
  roundNumber,
}: {
  content: string
  sessionId: string
  roundNumber: number
}) {
  const [activeFindings, setActiveFindings] = useState<Finding[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)

  const segments = useMemo(() => {
    try {
      return buildSegments(content)
    } catch {
      return [{ type: 'md' as const, id: 0, content }]
    }
  }, [content])

  const items = useMemo(
    () => segments.filter((s): s is Segment & { type: 'item' } => s.type === 'item'),
    [segments],
  )

  const allFindings = useMemo(() => items.map(segmentToFinding), [items])

  function openSingle(seg: Segment & { type: 'item' }) {
    setActiveFindings([segmentToFinding(seg)])
    setDialogOpen(true)
  }

  function openAll() {
    setActiveFindings(allFindings)
    setDialogOpen(true)
  }

  return (
    <div>
      {/* Sticky toolbar — Fix All button */}
      {items.length > 0 && (
        <div className="sticky top-0 z-10 mb-4 flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/95 px-4 py-2.5 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {items.length} fixable item{items.length !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={openAll}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 cursor-pointer"
          >
            <Wrench className="h-3.5 w-3.5" />
            Fix All ({items.length})
          </button>
        </div>
      )}

      {/* Document — markdown rendered in order; each fixable item gets an inline Fix button */}
      <div>
        {segments.map((seg) => {
          if (seg.type === 'md') {
            return <MarkdownRenderer key={seg.id} content={seg.content} />
          }

          const isSugg = seg.kind === 'suggestion'

          return (
            <div
              key={seg.id}
              className={cn(
                'group relative rounded-md border border-transparent px-3 py-2 -mx-3 transition-colors hover:border-zinc-200 hover:bg-zinc-50/60 dark:hover:border-zinc-800 dark:hover:bg-zinc-900/40',
                isSugg ? 'my-0.5' : 'my-1',
              )}
            >
              {/* Fix button — always visible on the right of the heading row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <MarkdownRenderer content={seg.headingLine} />
                </div>
                <button
                  type="button"
                  onClick={() => openSingle(seg)}
                  className={cn(
                    'mt-1 shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                    seg.kind === 'blocker'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : seg.kind === 'should-fix'
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-zinc-600 text-white hover:bg-zinc-700',
                  )}
                  title={`Fix: ${SEVERITY_LABEL[seg.kind]}`}
                >
                  <Wrench className="h-3 w-3" />
                  Fix
                </button>
              </div>

              {/* Severity badge */}
              <span className={cn(
                'mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                SEVERITY_BADGE[seg.kind],
              )}>
                {SEVERITY_LABEL[seg.kind]}
              </span>

              {seg.bodyContent.trim() && (
                <MarkdownRenderer content={seg.bodyContent} />
              )}
            </div>
          )
        })}
      </div>

      {dialogOpen && activeFindings.length > 0 && (
        <BatchFixDialog
          findings={activeFindings}
          sessionId={sessionId}
          roundNumber={roundNumber}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}
