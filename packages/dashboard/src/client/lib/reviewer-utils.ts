import type { ReviewerMeta, ReviewerTier } from '../features/commands/hooks/use-reviewers'

export const TIER_CONFIG: Record<ReviewerTier, { label: string; order: number }> = {
  holistic: { label: 'Generalists', order: 0 },
  specialist: { label: 'Specialists', order: 1 },
  persona: { label: 'Famous Engineers', order: 2 },
  custom: { label: 'Custom', order: 3 },
}

/**
 * Filter reviewers by a search query across name, description, focus_areas, and known_for.
 */
export function filterReviewers(reviewers: ReviewerMeta[], query: string): ReviewerMeta[] {
  if (!query.trim()) return reviewers
  const q = query.toLowerCase()
  return reviewers.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.focus_areas.some((f) => f.toLowerCase().includes(q)) ||
      r.known_for?.toLowerCase().includes(q),
  )
}

/**
 * Group reviewers by tier, sorted by tier order. Empty tiers are omitted.
 */
export function groupByTier(reviewers: ReviewerMeta[]): [ReviewerTier, ReviewerMeta[]][] {
  const groups = new Map<ReviewerTier, ReviewerMeta[]>()
  for (const r of reviewers) {
    const list = groups.get(r.tier) ?? []
    list.push(r)
    groups.set(r.tier, list)
  }
  return [...groups.entries()].sort(
    (a, b) => TIER_CONFIG[a[0]].order - TIER_CONFIG[b[0]].order,
  )
}

/**
 * Convert a display name to a valid reviewer slug.
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
