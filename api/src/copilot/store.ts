import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import type {
  AgentFinding,
  CompletedReview,
  PublicCopilotSummary,
  PublicReview,
  ReviewStatus,
  StoredCallLog,
} from './types.js'

type ReviewRow = {
  location_id: string
  call_id: string
  agent_id: string
  status: ReviewStatus
  rating: number | null
  outcome: string | null
  failure_reason: string | null
  sentiment: string | null
  needs_human_review: number | null
  rating_reason: string | null
  top_finding: string | null
  recommendations_json: string | null
  tool_findings_json: string | null
  agent_findings_json: string | null
  error_message: string | null
  updated_at: string
}

type CallLogRow = {
  raw_json: string
}

type ClaimRow = {
  location_id: string
  call_id: string
  agent_id: string
}

type DurationRow = {
  duration: number
}

export type ReviewJob = {
  locationId: string
  callId: string
  agentId: string
}

export class CopilotStore {
  private db: DatabaseSync | null = null
  private readonly dbPath: string

  constructor(dbPath: string) {
    this.dbPath = resolve(dbPath)
  }

  init() {
    if (this.db) {
      return
    }

    mkdirSync(dirname(this.dbPath), { recursive: true })
    this.db = new DatabaseSync(this.dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.createTables()
  }

  close() {
    this.db?.close()
    this.db = null
  }

  upsertCallLog(locationId: string, callLog: StoredCallLog) {
    const now = new Date().toISOString()

    this.getDb()
      .prepare(
        `
          INSERT INTO copilot_call_logs (
            location_id,
            call_id,
            agent_id,
            created_at,
            duration,
            raw_json,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(location_id, call_id) DO UPDATE SET
            agent_id = excluded.agent_id,
            created_at = excluded.created_at,
            duration = excluded.duration,
            raw_json = excluded.raw_json,
            updated_at = excluded.updated_at
        `
      )
      .run(
        locationId,
        callLog.id,
        callLog.agentId,
        callLog.createdAt,
        normalizeDuration(callLog.duration),
        JSON.stringify(callLog),
        now
      )
  }

  recordWebhookEvent(eventId: string, type: string, locationId: string, callId: string | null, payload: unknown) {
    const now = new Date().toISOString()
    const result = this.getDb()
      .prepare(
        `
          INSERT OR IGNORE INTO copilot_webhook_events (
            event_id,
            type,
            location_id,
            call_id,
            payload_json,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run(eventId, type, locationId, callId, JSON.stringify(payload), now)

    return result.changes > 0
  }

  ensureReviewQueued(locationId: string, callLog: StoredCallLog) {
    const now = new Date().toISOString()
    const result = this.getDb()
      .prepare(
        `
          INSERT OR IGNORE INTO copilot_reviews (
            location_id,
            call_id,
            agent_id,
            status,
            attempts,
            queued_at,
            updated_at
          )
          VALUES (?, ?, ?, 'queued', 0, ?, ?)
        `
      )
      .run(locationId, callLog.id, callLog.agentId, now, now)

    return result.changes > 0
  }

  retryReview(locationId: string, callLog: StoredCallLog) {
    const now = new Date().toISOString()

    this.upsertCallLog(locationId, callLog)
    this.ensureReviewQueued(locationId, callLog)

    const result = this.getDb()
      .prepare(
        `
          UPDATE copilot_reviews
          SET status = 'queued',
            error_message = NULL,
            queued_at = ?,
            started_at = NULL,
            completed_at = NULL,
            updated_at = ?
          WHERE location_id = ?
            AND call_id = ?
            AND status = 'failed'
        `
      )
      .run(now, now, locationId, callLog.id)

    return result.changes > 0
  }

  resetProcessingReviews() {
    const now = new Date().toISOString()

    this.getDb()
      .prepare(
        `
          UPDATE copilot_reviews
          SET status = 'queued',
            started_at = NULL,
            updated_at = ?
          WHERE status = 'processing'
        `
      )
      .run(now)
  }

  claimNextReview(): ReviewJob | null {
    const db = this.getDb()
    const row = db
      .prepare(
        `
          SELECT location_id, call_id, agent_id
          FROM copilot_reviews
          WHERE status = 'queued'
          ORDER BY queued_at ASC
          LIMIT 1
        `
      )
      .get() as ClaimRow | undefined

    if (!row) {
      return null
    }

    const now = new Date().toISOString()
    const result = db
      .prepare(
        `
          UPDATE copilot_reviews
          SET status = 'processing',
            attempts = attempts + 1,
            started_at = ?,
            updated_at = ?,
            error_message = NULL
          WHERE location_id = ?
            AND call_id = ?
            AND status = 'queued'
        `
      )
      .run(now, now, row.location_id, row.call_id)

    if (result.changes === 0) {
      return null
    }

    return {
      locationId: row.location_id,
      callId: row.call_id,
      agentId: row.agent_id,
    }
  }

  markReviewCompleted(job: ReviewJob, review: CompletedReview) {
    const now = new Date().toISOString()

    this.getDb()
      .prepare(
        `
          UPDATE copilot_reviews
          SET status = 'completed',
            rating = ?,
            outcome = ?,
            failure_reason = ?,
            sentiment = ?,
            needs_human_review = ?,
            rating_reason = ?,
            top_finding = ?,
            recommendations_json = ?,
            tool_findings_json = ?,
            agent_findings_json = ?,
            error_message = NULL,
            completed_at = ?,
            updated_at = ?
          WHERE location_id = ?
            AND call_id = ?
        `
      )
      .run(
        review.rating,
        review.outcome,
        review.failureReason,
        review.sentiment,
        review.needsHumanReview ? 1 : 0,
        review.ratingReason,
        review.topFinding,
        JSON.stringify(review.recommendations),
        JSON.stringify(review.toolFindings),
        JSON.stringify(review.agentFindings),
        now,
        now,
        job.locationId,
        job.callId
      )
  }

  markReviewFailed(job: ReviewJob, errorMessage: string) {
    const now = new Date().toISOString()

    this.getDb()
      .prepare(
        `
          UPDATE copilot_reviews
          SET status = 'failed',
            error_message = ?,
            completed_at = ?,
            updated_at = ?
          WHERE location_id = ?
            AND call_id = ?
        `
      )
      .run(errorMessage, now, now, job.locationId, job.callId)
  }

  getCallLog(locationId: string, callId: string) {
    const row = this.getDb()
      .prepare(
        `
          SELECT raw_json
          FROM copilot_call_logs
          WHERE location_id = ? AND call_id = ?
        `
      )
      .get(locationId, callId) as CallLogRow | undefined

    return row ? (JSON.parse(row.raw_json) as StoredCallLog) : null
  }

  getReviews(locationId: string, callIds: string[]) {
    const reviews = new Map<string, PublicReview>()

    for (const callId of callIds) {
      const review = this.getReview(locationId, callId)

      if (review) {
        reviews.set(callId, review)
      }
    }

    return reviews
  }

  getReview(locationId: string, callId: string) {
    const row = this.getDb()
      .prepare(
        `
          SELECT *
          FROM copilot_reviews
          WHERE location_id = ? AND call_id = ?
        `
      )
      .get(locationId, callId) as ReviewRow | undefined

    return row ? toPublicReview(row) : null
  }

  getAgentDurationP95(locationId: string, agentId: string) {
    const rows = this.getDb()
      .prepare(
        `
          SELECT duration
          FROM copilot_call_logs
          WHERE location_id = ? AND agent_id = ?
          ORDER BY created_at DESC
          LIMIT 200
        `
      )
      .all(locationId, agentId) as DurationRow[]

    return percentile(
      rows.map((row) => normalizeDuration(row.duration)),
      0.95
    )
  }

  summarizeReviews(reviews: Array<PublicReview | null | undefined>, callLogs: StoredCallLog[] = []): PublicCopilotSummary {
    const completed = reviews.filter((review) => review?.status === 'completed') as PublicReview[]
    const findings = completed.flatMap((review) => review.agentFindings ?? [])
    const toolCallsAnalyzed = reviews.reduce((total, review, index) => {
      if (review?.status !== 'completed') {
        return total
      }

      return total + countToolCalls(callLogs[index])
    }, 0)
    const toolIssues = completed
      .flatMap((review) => review.toolFindings ?? [])
      .filter((finding) => finding.correctness === 'incorrect' || finding.correctness === 'questionable').length

    return {
      reviewsCompleted: completed.length,
      reviewsProcessing: reviews.filter((review) => review?.status === 'processing').length,
      reviewsQueued: reviews.filter((review) => review?.status === 'queued').length,
      reviewsFailed: reviews.filter((review) => review?.status === 'failed').length,
      needsAttention: completed.filter((review) => review.rating === 2).length,
      critical: completed.filter((review) => review.rating === 3).length,
      topAgentFinding: rankFindings(findings)[0],
      dashboardKpis: {
        analyzedCalls: completed.length,
        successRate: percentage(completed.filter((review) => review.outcome === 'success').length, completed.length),
        completionQuality: percentage(
          completed.reduce((score, review) => {
            if (review.outcome === 'success') {
              return score + 1
            }

            if (review.outcome === 'partial_success') {
              return score + 0.5
            }

            return score
          }, 0),
          completed.length
        ),
        healthyCallRate: percentage(completed.filter((review) => review.rating === 1).length, completed.length),
        positiveSentimentRate: percentage(completed.filter((review) => review.sentiment === 'positive').length, completed.length),
        toolAccuracyRate: percentage(Math.max(0, toolCallsAnalyzed - toolIssues), toolCallsAnalyzed),
      },
    }
  }

  private createTables() {
    this.getDb().exec(`
      CREATE TABLE IF NOT EXISTS copilot_call_logs (
        location_id TEXT NOT NULL,
        call_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        duration INTEGER NOT NULL,
        raw_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (location_id, call_id)
      );

      CREATE TABLE IF NOT EXISTS copilot_reviews (
        location_id TEXT NOT NULL,
        call_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        rating INTEGER,
        outcome TEXT,
        failure_reason TEXT,
        sentiment TEXT,
        needs_human_review INTEGER,
        rating_reason TEXT,
        top_finding TEXT,
        recommendations_json TEXT,
        tool_findings_json TEXT,
        agent_findings_json TEXT,
        error_message TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        queued_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (location_id, call_id)
      );

      CREATE TABLE IF NOT EXISTS copilot_webhook_events (
        event_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        location_id TEXT NOT NULL,
        call_id TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_copilot_reviews_status
      ON copilot_reviews(status, queued_at);

      CREATE INDEX IF NOT EXISTS idx_copilot_call_logs_agent
      ON copilot_call_logs(location_id, agent_id, created_at);
    `)
  }

  private getDb() {
    if (!this.db) {
      throw new Error('CopilotStore is not initialized')
    }

    return this.db
  }
}

function toPublicReview(row: ReviewRow): PublicReview {
  const base = {
    status: row.status,
    errorMessage: row.error_message ?? undefined,
    updatedAt: row.updated_at,
  }

  if (row.status !== 'completed') {
    return base
  }

  return {
    ...base,
    rating: normalizeRating(row.rating),
    outcome: row.outcome as PublicReview['outcome'],
    failureReason: row.failure_reason as PublicReview['failureReason'],
    sentiment: row.sentiment as PublicReview['sentiment'],
    needsHumanReview: Boolean(row.needs_human_review),
    ratingReason: row.rating_reason ?? '',
    topFinding: row.top_finding ?? '',
    recommendations: parseJsonArray(row.recommendations_json),
    toolFindings: parseJsonArray(row.tool_findings_json),
    agentFindings: parseJsonArray(row.agent_findings_json),
  }
}

function parseJsonArray(value: string | null) {
  if (!value) {
    return []
  }

  const parsed = JSON.parse(value)

  return Array.isArray(parsed) ? parsed : []
}

function normalizeRating(value: number | null) {
  return value === 2 || value === 3 ? value : 1
}

function normalizeDuration(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function percentile(values: number[], percentileValue: number) {
  const sorted = values.filter((value) => value > 0).sort((left, right) => left - right)

  if (!sorted.length) {
    return null
  }

  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)

  return sorted[index]
}

function rankFindings(findings: AgentFinding[]) {
  const severityRank: Record<AgentFinding['severity'], number> = {
    high: 3,
    medium: 2,
    low: 1,
  }

  return [...findings].sort((left, right) => severityRank[right.severity] - severityRank[left.severity])
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) {
    return null
  }

  return Math.round((numerator / denominator) * 100)
}

function countToolCalls(callLog?: StoredCallLog) {
  if (!callLog) {
    return 0
  }

  const transcriptToolCalls =
    callLog.transcriptWithToolCalls?.filter((entry) => entry.role === 'action_executed').length ?? 0

  return transcriptToolCalls || callLog.executedCallActions?.length || 0
}
