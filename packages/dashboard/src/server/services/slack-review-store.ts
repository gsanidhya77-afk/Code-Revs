/**
 * In-memory store for Slack-triggered PR reviews.
 *
 * Tracks which Slack user requested a review for which PR URL,
 * so the bot can DM them on completion and detect when someone
 * else reviews the same PR.
 */

export type TrackedReview = {
  prUrl: string
  prOwner: string
  prRepo: string
  prNumber: number
  /** Slack user ID who triggered the review */
  slackUserId: string
  /** Slack channel where the @mention happened */
  channelId: string
  startTime: Date
  /** Set once the session directory is known (from final.md path) */
  sessionDir?: string
}

export class SlackReviewStore {
  // keyed by normalised PR URL (lowercased, trailing-slash stripped)
  private byPrUrl = new Map<string, TrackedReview>()
  // keyed by session directory (absolute path) — set after review starts
  private bySessionDir = new Map<string, TrackedReview>()

  private static normalise(prUrl: string): string {
    return prUrl.toLowerCase().replace(/\/+$/, '')
  }

  track(review: TrackedReview): void {
    this.byPrUrl.set(SlackReviewStore.normalise(review.prUrl), review)
  }

  get(prUrl: string): TrackedReview | undefined {
    return this.byPrUrl.get(SlackReviewStore.normalise(prUrl))
  }

  linkSession(prUrl: string, sessionDir: string): void {
    const entry = this.byPrUrl.get(SlackReviewStore.normalise(prUrl))
    if (entry) {
      entry.sessionDir = sessionDir
      this.bySessionDir.set(sessionDir, entry)
    }
  }

  getBySessionDir(sessionDir: string): TrackedReview | undefined {
    return this.bySessionDir.get(sessionDir)
  }

  remove(prUrl: string): void {
    const key = SlackReviewStore.normalise(prUrl)
    const entry = this.byPrUrl.get(key)
    if (entry?.sessionDir) this.bySessionDir.delete(entry.sessionDir)
    this.byPrUrl.delete(key)
  }

  all(): TrackedReview[] {
    return Array.from(this.byPrUrl.values())
  }
}
