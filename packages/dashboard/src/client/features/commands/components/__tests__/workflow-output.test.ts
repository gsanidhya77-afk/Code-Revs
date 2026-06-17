import { describe, it, expect } from 'vitest'
import { parseOutput } from '../workflow-output'

// ── parseOutput ───────────────────────────────────────────────────────────────

describe('parseOutput', () => {
  // ── Empty / falsy input ──

  it('returns an empty array for an empty string', () => {
    expect(parseOutput('')).toEqual([])
  })

  // ── Tool lines ──

  describe('tool lines (starting with ▸)', () => {
    it('converts a "▸ ..." line into a tool segment', () => {
      const segments = parseOutput('▸ Reading file src/index.ts')
      expect(segments).toHaveLength(1)
      expect(segments[0]).toEqual({ type: 'tool', text: 'Reading file src/index.ts' })
    })

    it('strips the leading "▸" and any trailing space from the segment text', () => {
      const segments = parseOutput('▸  Extra space after arrow')
      expect(segments[0]?.type).toBe('tool')
      expect(segments[0]?.text).toBe('Extra space after arrow')
    })

    it('handles multiple consecutive tool lines', () => {
      const raw = '▸ Tool A\n▸ Tool B\n▸ Tool C'
      const segments = parseOutput(raw)
      expect(segments).toHaveLength(3)
      expect(segments.map((s) => s.type)).toEqual(['tool', 'tool', 'tool'])
      expect(segments.map((s) => s.text)).toEqual(['Tool A', 'Tool B', 'Tool C'])
    })
  })

  // ── Empty lines (deduplication) ──

  describe('empty lines', () => {
    it('converts a blank line that follows content into an empty segment', () => {
      const segments = parseOutput('Hello world\n\nNext paragraph')
      const emptyCount = segments.filter((s) => s.type === 'empty').length
      expect(emptyCount).toBe(1)
    })

    it('deduplicates consecutive empty lines into a single empty segment', () => {
      const raw = 'Line one\n\n\n\nLine two'
      const segments = parseOutput(raw)
      const emptySegments = segments.filter((s) => s.type === 'empty')
      expect(emptySegments).toHaveLength(1)
    })

    it('does not add an empty segment at the very start of the output', () => {
      // Leading blank lines before any content produce no empty segment
      const raw = '\n\nFirst real line'
      const segments = parseOutput(raw)
      expect(segments[0]?.type).not.toBe('empty')
    })

    it('removes a trailing empty segment', () => {
      const raw = 'Some text\n\n'
      const segments = parseOutput(raw)
      expect(segments[segments.length - 1]?.type).not.toBe('empty')
    })

    it('trailing-only empty output collapses to nothing after strip', () => {
      // A string that is purely blank lines should produce no output after
      // stripping the trailing empty segment
      const raw = '\n\n\n'
      const segments = parseOutput(raw)
      // All lines are empty; the first blank has no preceding non-empty segment
      // so nothing is pushed; result must be empty
      expect(segments).toHaveLength(0)
    })
  })

  // ── Regular text lines (merging) ──

  describe('regular text lines', () => {
    it('creates a single text segment for a single plain line', () => {
      const segments = parseOutput('Hello, world!')
      expect(segments).toHaveLength(1)
      expect(segments[0]).toEqual({ type: 'text', text: 'Hello, world!' })
    })

    it('merges consecutive non-structural text lines into one segment', () => {
      const raw = 'First token\nSecond token\nThird token'
      const segments = parseOutput(raw)
      expect(segments).toHaveLength(1)
      expect(segments[0]?.type).toBe('text')
      expect(segments[0]?.text).toBe('First token Second token Third token')
    })

    it('does NOT merge a text line into the previous segment across an empty line', () => {
      const raw = 'Paragraph one\n\nParagraph two'
      const segments = parseOutput(raw)
      const textSegments = segments.filter((s) => s.type === 'text')
      expect(textSegments).toHaveLength(2)
      expect(textSegments[0]?.text).toBe('Paragraph one')
      expect(textSegments[1]?.text).toBe('Paragraph two')
    })

    it('does NOT merge a text line into a preceding tool segment', () => {
      const raw = '▸ Tool activity\nFollowing text'
      const segments = parseOutput(raw)
      expect(segments).toHaveLength(2)
      expect(segments[0]?.type).toBe('tool')
      expect(segments[1]?.type).toBe('text')
      expect(segments[1]?.text).toBe('Following text')
    })
  })

  // ── Markdown structural lines ──

  describe('markdown structural lines', () => {
    it('treats a "## Header" line as its own text segment (not merged)', () => {
      const raw = 'Some intro text\n## Section Title'
      const segments = parseOutput(raw)
      const textSegments = segments.filter((s) => s.type === 'text')
      // The header must NOT be merged onto the intro text
      expect(textSegments).toHaveLength(2)
      expect(textSegments[1]?.text).toBe('## Section Title')
    })

    it('treats "# H1" through "###### H6" as structural (not merged)', () => {
      const headers = ['# H1', '## H2', '### H3', '#### H4', '##### H5', '###### H6']
      for (const header of headers) {
        const segments = parseOutput(`Intro\n${header}`)
        const texts = segments.filter((s) => s.type === 'text')
        expect(texts).toHaveLength(2)
        expect(texts[1]?.text).toBe(header)
      }
    })

    it('treats "- item" (unordered list) as structural', () => {
      const raw = 'Summary\n- First item'
      const segments = parseOutput(raw)
      const textSegments = segments.filter((s) => s.type === 'text')
      expect(textSegments).toHaveLength(2)
      expect(textSegments[1]?.text).toBe('- First item')
    })

    it('treats "* item" (unordered list) as structural', () => {
      const raw = 'Summary\n* Another item'
      const segments = parseOutput(raw)
      const textSegments = segments.filter((s) => s.type === 'text')
      expect(textSegments).toHaveLength(2)
      expect(textSegments[1]?.text).toBe('* Another item')
    })

    it('treats "1. item" (ordered list) as structural', () => {
      const raw = 'Summary\n1. Step one'
      const segments = parseOutput(raw)
      const textSegments = segments.filter((s) => s.type === 'text')
      expect(textSegments).toHaveLength(2)
      expect(textSegments[1]?.text).toBe('1. Step one')
    })

    it('treats a "```" code fence as structural', () => {
      const raw = 'Some text\n```'
      const segments = parseOutput(raw)
      const textSegments = segments.filter((s) => s.type === 'text')
      expect(textSegments).toHaveLength(2)
      expect(textSegments[1]?.text).toBe('```')
    })

    it('treats "> blockquote" as structural', () => {
      const raw = 'Note:\n> This is a quote'
      const segments = parseOutput(raw)
      const textSegments = segments.filter((s) => s.type === 'text')
      expect(textSegments).toHaveLength(2)
      expect(textSegments[1]?.text).toBe('> This is a quote')
    })

    it('treats "---" (horizontal rule) as structural', () => {
      const raw = 'Section end\n---'
      const segments = parseOutput(raw)
      const textSegments = segments.filter((s) => s.type === 'text')
      expect(textSegments).toHaveLength(2)
      expect(textSegments[1]?.text).toBe('---')
    })
  })

  // ── Mixed content ──

  describe('mixed content', () => {
    it('correctly sequences tool, empty, and text segments in a realistic output', () => {
      const raw = [
        '▸ Reading file src/app.ts',
        '',
        '## Analysis',
        'The code looks good.',
        'No issues found.',
        '',
        '▸ Writing report',
      ].join('\n')

      const segments = parseOutput(raw)

      expect(segments[0]).toEqual({ type: 'tool', text: 'Reading file src/app.ts' })
      expect(segments[1]).toEqual({ type: 'empty', text: '' })
      // "## Analysis" is structural so it starts a new text segment.
      // The two non-structural lines that follow ("The code looks good." and
      // "No issues found.") are merged onto the preceding text segment, so the
      // final text for this segment includes all three parts.
      expect(segments[2]).toEqual({
        type: 'text',
        text: '## Analysis The code looks good. No issues found.',
      })
      // The empty line before "▸ Writing report" produces an empty segment.
      expect(segments[3]).toEqual({ type: 'empty', text: '' })
      // Last segment is the trailing tool line.
      expect(segments[4]).toEqual({ type: 'tool', text: 'Writing report' })
      expect(segments).toHaveLength(5)
    })

    it('does not produce a trailing empty segment', () => {
      const raw = 'Some output\n\n'
      const segments = parseOutput(raw)
      const last = segments[segments.length - 1]
      expect(last?.type).not.toBe('empty')
    })
  })
})
