import { useState, useMemo, useCallback } from 'react'
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

/**
 * Split the final.md markdown into alternating "plain markdown" and "checkboxable item"
 * segments, preserving document order exactly as it will appear on GitHub.
 *
 * Checkboxable lines:
 *   Blockers    — "### 🚫 N. Title"
 *   Should Fix  — "### N. Title"  (no emoji, digit-dot prefix)
 *   Suggestions — "- "quoted"" bullet lines
 *
 * Everything else (headers, tables, prose, code blocks) stays in markdown segments.
 */
function buildSegments(markdown: string): Segment[] {
  const lines = markdown.split('\n')
  const segments: Segment[] = []
  let mdBuf: string[] = []
  let segId = 0   // shared across md + item segments (unique key per segment)
  let itemId = 0  // sequential counter for checkboxable items only

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
    // ## section breaks always close any active item (prevents ## Should Fix
    // from accidentally ending up in a blocker's body content)
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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [perNotes, setPerNotes] = useState<Record<number, string>>({})
  const [batchOpen, setBatchOpen] = useState(false)

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

  const totalFixable = items.length

  const toggle = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === totalFixable && totalFixable > 0
        ? new Set<number>()
        : new Set<number>(items.map((f) => f.id)),
    )
  }, [items, totalFixable])

  const selectedFindings = useMemo(
    () => items.filter((f) => selectedIds.has(f.id)).map(segmentToFinding),
    [items, selectedIds],
  )

  return (
    <div>
      {/* Select-all toolbar — only shown when there are fixable items */}
      {totalFixable > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/60 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedIds.size === totalFixable && totalFixable > 0}
              ref={(el) => {
                if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < totalFixable
              }}
              onChange={toggleAll}
              aria-label="Select all fixable items"
              className="h-3.5 w-3.5 cursor-pointer rounded border-zinc-300 accent-emerald-600 dark:border-zinc-600"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {totalFixable} fixable item{totalFixable !== 1 ? 's' : ''}
            </span>
          </div>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setBatchOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 cursor-pointer"
            >
              <Wrench className="h-3.5 w-3.5" />
              Fix {selectedIds.size} selected
            </button>
          )}
        </div>
      )}

      {/* Document — full markdown in order, checkboxes injected at item lines */}
      <div>
        {segments.map((seg) => {
          if (seg.type === 'md') {
            return <MarkdownRenderer key={seg.id} content={seg.content} />
          }

          const selected = selectedIds.has(seg.id)
          const isSugg = seg.kind === 'suggestion'

          return (
            <div
              key={seg.id}
              className={cn(
                'flex items-start gap-2 rounded-sm px-1 -mx-1 transition-colors',
                selected ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : '',
                isSugg ? 'my-0.5' : '',
              )}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(seg.id)}
                className={cn(
                  'h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-zinc-300 accent-emerald-600 dark:border-zinc-600',
                  isSugg ? 'mt-[4px]' : 'mt-[5px]',
                )}
                aria-label="Select for fix"
              />
              <div className="min-w-0 flex-1">
                <MarkdownRenderer content={seg.headingLine} />
                {seg.bodyContent.trim() && (
                  <MarkdownRenderer content={seg.bodyContent} />
                )}
                {selected && (
                  <textarea
                    value={perNotes[seg.id] ?? ''}
                    onChange={(e) => setPerNotes((prev) => ({ ...prev, [seg.id]: e.target.value }))}
                    placeholder="Instructions for Author Agent (optional) — e.g. use the helper in utils.ts, keep the same API signature…"
                    rows={2}
                    className="mt-2 w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs placeholder:text-zinc-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {batchOpen && selectedFindings.length > 0 && (
        <BatchFixDialog
          findings={selectedFindings}
          sessionId={sessionId}
          roundNumber={roundNumber}
          initialPerNotes={perNotes}
          onClose={() => setBatchOpen(false)}
        />
      )}
    </div>
  )
}
