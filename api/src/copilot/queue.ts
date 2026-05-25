import type { CopilotAnalyzer } from './analyzer.js'
import type { CopilotStore, ReviewJob } from './store.js'

export class ReviewQueue {
  private draining = false
  private drainAgain = false

  constructor(
    private readonly store: CopilotStore,
    private readonly analyzer: CopilotAnalyzer
  ) {}

  start() {
    this.store.resetProcessingReviews()
    this.kick()
  }

  kick() {
    if (this.draining) {
      this.drainAgain = true
      return
    }

    this.draining = true
    void this.drain()
  }

  private async drain() {
    try {
      do {
        this.drainAgain = false
        let job: ReviewJob | null = null

        while ((job = this.store.claimNextReview())) {
          await this.processJob(job)
        }
      } while (this.drainAgain)
    } finally {
      this.draining = false

      if (this.drainAgain) {
        this.kick()
      }
    }
  }

  private async processJob(job: ReviewJob) {
    try {
      const review = await this.analyzer.analyze(job)
      this.store.markReviewCompleted(job, review)
    } catch (error) {
      this.store.markReviewFailed(job, getErrorMessage(error))
    }
  }
}

function getErrorMessage(error: unknown) {
  if (isAiApiError(error)) {
    const rawProviderError = error.data?.error?.metadata?.raw

    if (typeof rawProviderError === 'string' && rawProviderError.trim()) {
      return `${error.message}: ${rawProviderError.trim()}`
    }

    if (typeof error.responseBody === 'string' && error.responseBody.trim()) {
      return `${error.message}: ${error.responseBody.trim()}`
    }
  }

  return error instanceof Error ? error.message : 'Unexpected review pipeline error'
}

function isAiApiError(error: unknown): error is {
  message: string
  responseBody?: string
  data?: {
    error?: {
      metadata?: {
        raw?: unknown
      }
    }
  }
} {
  return typeof error === 'object' && error !== null && 'message' in error
}
