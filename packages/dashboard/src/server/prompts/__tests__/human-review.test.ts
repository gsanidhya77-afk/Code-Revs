import { describe, it, expect } from 'vitest'
import { buildHumanReviewPrompt } from '../human-review.js'

// ── buildHumanReviewPrompt ───────────────────────────────────────────────────

describe('buildHumanReviewPrompt', () => {
  const sampleFinal = '# Final Review\n\n## Verdict\n\n**APPROVE**'

  it('returns a non-empty string', () => {
    const result = buildHumanReviewPrompt(sampleFinal, [])
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes the final review content wrapped in tags', () => {
    const result = buildHumanReviewPrompt(sampleFinal, [])
    expect(result).toContain('<final-review>')
    expect(result).toContain(sampleFinal)
    expect(result).toContain('</final-review>')
  })

  it('includes each reviewer output in its own tagged block', () => {
    const reviewers = [
      { name: 'principal-1', content: '## Finding: Bug\nSeverity: high' },
      { name: 'quality-1', content: '## Finding: Style\nSeverity: low' },
    ]
    const result = buildHumanReviewPrompt(sampleFinal, reviewers)

    expect(result).toContain('<reviewer-output name="principal-1">')
    expect(result).toContain('## Finding: Bug')
    expect(result).toContain('</reviewer-output>')

    expect(result).toContain('<reviewer-output name="quality-1">')
    expect(result).toContain('## Finding: Style')
  })

  it('includes the task instructions section', () => {
    const result = buildHumanReviewPrompt(sampleFinal, [])
    expect(result).toContain('## Your Task')
    expect(result).toContain('GitHub PR comment')
  })

  it('includes voice and tone guidelines', () => {
    const result = buildHumanReviewPrompt(sampleFinal, [])
    expect(result).toContain('## Voice & Tone')
  })

  it('includes writing style rules', () => {
    const result = buildHumanReviewPrompt(sampleFinal, [])
    expect(result).toContain('## Writing Style')
    expect(result).toContain('Sound Like a Human')
  })

  it('includes content rules section', () => {
    const result = buildHumanReviewPrompt(sampleFinal, [])
    expect(result).toContain('## Content Rules')
    expect(result).toContain('NON-NEGOTIABLE')
  })

  it('includes the absolute donts section', () => {
    const result = buildHumanReviewPrompt(sampleFinal, [])
    expect(result).toContain("## Absolute Don'ts")
  })

  it('handles an empty final content string', () => {
    const result = buildHumanReviewPrompt('', [])
    expect(result).toContain('<final-review>')
    expect(result).toContain('</final-review>')
    // Should still include instructions
    expect(result).toContain('## Your Task')
  })

  it('handles an empty reviewers array', () => {
    const result = buildHumanReviewPrompt(sampleFinal, [])
    // No reviewer-output tags when array is empty
    expect(result).not.toContain('<reviewer-output')
  })

  it('handles a single reviewer', () => {
    const reviewers = [
      { name: 'security-1', content: 'LGTM' },
    ]
    const result = buildHumanReviewPrompt(sampleFinal, reviewers)
    expect(result).toContain('<reviewer-output name="security-1">')
    expect(result).toContain('LGTM')
    expect(result).toContain('</reviewer-output>')
  })

  it('preserves reviewer content verbatim', () => {
    const content = 'Line 1\n\n## Finding: Special chars <>&"\n\n```ts\ncode()\n```'
    const reviewers = [{ name: 'test', content }]
    const result = buildHumanReviewPrompt(sampleFinal, reviewers)
    expect(result).toContain(content)
  })
})
