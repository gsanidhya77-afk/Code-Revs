/**
 * Parser for reviewer output markdown files (e.g., principal-1.md, quality-1.md).
 *
 * Extracts findings with severity, file path, line range, and summary.
 */

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type ParsedFinding = {
  title: string
  severity: FindingSeverity
  filePath: string | null
  lineStart: number | null
  lineEnd: number | null
  summary: string
  isBlocker: boolean
}

export type ParsedReviewerOutput = {
  findings: ParsedFinding[]
}

// Matches the legacy "### Finding 1: Title" / "### Issue: Title" format
const FINDING_HEADING_RE = /^#{2,3}\s+(?:Finding|Issue|Suggestion)\s*(?:\d+)?\s*[:\s]*\s*(.*)/i
// Matches the plain-title format used by performance/specialist reviewers:
//   "### N+1 queries in _enrich_events — BLOCKER"
//   "### Missing index — SHOULD FIX"
//   "### Consider caching — SUGGESTION"
// (activated only when inside a ## Findings section)
const PLAIN_FINDING_HEADING_RE = /^###\s+(.*)/
// Suffix tags in plain headings that encode severity / blocker status
const HEADING_SUFFIX_RE = /\s+[—–-]+\s*(BLOCKER|SHOULD[\s_]FIX|SUGGESTION|INFO)\s*$/i
// Section boundary detectors
const FINDINGS_SECTION_RE = /^##\s+Findings?\b/i
const NON_FINDINGS_SECTION_RE = /^##\s+(?!Findings?\b)/i

const SEVERITY_RE = /\*?\*?Severity\*?\*?\s*:?\s*(critical|high|medium|low|info)/i
const FILE_RE = /^[-\s]*\*?\*?(?:File|Location)\*?\*?\s*:\s*`?([^`\n]+)`?/i
const LINES_RE = /^[-\s]*\*?\*?(?:Lines?)\*?\*?\s*:\s*(?:L)?(\d+)(?:\s*[-–]\s*(?:L)?(\d+))?/i
const SEVERITY_LINE_RE = /^-\s+\*?\*?Severity\*?\*?\s*:\s*(critical|high|medium|low|info)/i

const VALID_SEVERITIES = new Set<string>(['critical', 'high', 'medium', 'low', 'info'])

/** Map heading suffix tags to severity levels. */
function suffixToSeverity(suffix: string): FindingSeverity {
  const s = suffix.toUpperCase().replace(/[\s_]/, '')
  if (s === 'BLOCKER')   return 'critical'
  if (s === 'SHOULDFIX') return 'high'
  if (s === 'SUGGESTION') return 'medium'
  return 'info'
}

/**
 * Parses a reviewer output markdown file into structured findings.
 */
export function parseReviewerOutput(content: string): ParsedReviewerOutput {
  const lines = content.split('\n')
  const findings: ParsedFinding[] = []

  let currentFinding: Partial<ParsedFinding> | null = null
  let summaryLines: string[] = []
  let inFindingsSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''

    // Track ## Findings section boundaries
    if (FINDINGS_SECTION_RE.test(line)) {
      inFindingsSection = true
      continue
    }
    if (NON_FINDINGS_SECTION_RE.test(line)) {
      // Leaving the Findings section — finalize any open finding
      if (currentFinding?.title) {
        findings.push(finalizeFinding(currentFinding, summaryLines))
        currentFinding = null
        summaryLines = []
      }
      inFindingsSection = false
    }

    // Detect finding heading — legacy keyword format (works anywhere in file)
    const legacyMatch = line.match(FINDING_HEADING_RE)
    if (legacyMatch) {
      if (currentFinding?.title) {
        findings.push(finalizeFinding(currentFinding, summaryLines))
      }
      currentFinding = { title: (legacyMatch[1] ?? '').trim() }
      summaryLines = []
      continue
    }

    // Detect plain ### heading inside ## Findings section
    // e.g. "### N+1 queries — BLOCKER" or "### Missing index — SHOULD FIX"
    if (inFindingsSection) {
      const plainMatch = line.match(PLAIN_FINDING_HEADING_RE)
      if (plainMatch) {
        if (currentFinding?.title) {
          findings.push(finalizeFinding(currentFinding, summaryLines))
        }
        let rawTitle = (plainMatch[1] ?? '').trim()
        // Extract severity from suffix tag and strip it from the display title
        const suffixMatch = rawTitle.match(HEADING_SUFFIX_RE)
        const headingSeverity = suffixMatch ? suffixToSeverity(suffixMatch[1] ?? '') : undefined
        const headingIsBlocker = suffixMatch
          ? (suffixMatch[1] ?? '').toUpperCase() === 'BLOCKER'
          : undefined
        if (suffixMatch) {
          rawTitle = rawTitle.slice(0, suffixMatch.index).trim()
        }
        currentFinding = {
          title: rawTitle,
          ...(headingSeverity ? { severity: headingSeverity } : {}),
          ...(headingIsBlocker !== undefined ? { isBlocker: headingIsBlocker } : {}),
        }
        summaryLines = []
        continue
      }
    }

    // If we hit a ### heading outside Findings section while tracking a finding, close it
    if (line.match(/^#{2,3}\s/) && currentFinding?.title) {
      findings.push(finalizeFinding(currentFinding, summaryLines))
      currentFinding = null
      summaryLines = []
      continue
    }

    if (!currentFinding) continue

    // Parse severity
    const severityMatch = line.match(SEVERITY_RE) ?? line.match(SEVERITY_LINE_RE)
    if (severityMatch && !currentFinding.severity) {
      const raw = (severityMatch[1] ?? '').toLowerCase()
      if (VALID_SEVERITIES.has(raw)) {
        currentFinding.severity = raw as FindingSeverity
      }
      continue
    }

    // Parse file path (and extract embedded line references like :L26 or :L85-87)
    const fileMatch = line.match(FILE_RE)
    if (fileMatch && currentFinding.filePath === undefined) {
      let fp = (fileMatch[1] ?? '').trim()
      // Extract line numbers from embedded references before stripping them
      const embeddedLines = fp.match(/[:\s]+L?(\d+)(?:\s*[-–]\s*L?(\d+))?\s*$/)
      if (embeddedLines && currentFinding.lineStart === undefined) {
        currentFinding.lineStart = parseInt(embeddedLines[1] ?? '0', 10)
        currentFinding.lineEnd = embeddedLines[2]
          ? parseInt(embeddedLines[2], 10)
          : currentFinding.lineStart
      }
      // Remove trailing line references
      fp = fp.replace(/[:\s]+L?\d+(?:\s*[-–]\s*L?\d+)?$/, '').trim()
      if (fp) {
        currentFinding.filePath = fp
      }
      continue
    }

    // Parse line range
    const linesMatch = line.match(LINES_RE)
    if (linesMatch && currentFinding.lineStart === undefined) {
      currentFinding.lineStart = parseInt(linesMatch[1] ?? '0', 10)
      currentFinding.lineEnd = linesMatch[2]
        ? parseInt(linesMatch[2], 10)
        : currentFinding.lineStart
      continue
    }

    // Collect summary lines (skip metadata lines already parsed above)
    const trimmed = line.trim()
    const isMetadataLine = /^[-\s]*\*?\*?(?:Severity|Location|File|Lines?)\*?\*?\s*:/i.test(trimmed)
    if (trimmed && !isMetadataLine) {
      summaryLines.push(trimmed)
    } else if (trimmed === '' && summaryLines.length > 0) {
      // Allow single blank lines within summary
      summaryLines.push('')
    }
  }

  // Finalize last finding
  if (currentFinding?.title) {
    findings.push(finalizeFinding(currentFinding, summaryLines))
  }

  return { findings }
}

function finalizeFinding(
  partial: Partial<ParsedFinding>,
  summaryLines: string[],
): ParsedFinding {
  // Trim trailing blank lines from summary
  while (summaryLines.length > 0 && summaryLines[summaryLines.length - 1] === '') {
    summaryLines.pop()
  }

  const severity = partial.severity ?? 'info'
  return {
    title: partial.title ?? '',
    severity,
    filePath: partial.filePath ?? null,
    lineStart: partial.lineStart ?? null,
    lineEnd: partial.lineEnd ?? null,
    summary: summaryLines.join('\n').trim(),
    // isBlocker is true when explicitly set from heading suffix OR when severity is critical
    isBlocker: partial.isBlocker === true || severity === 'critical',
  }
}
