import { generateObject } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import type { HighLevel } from '@gohighlevel/api-client'
import type { AppConfig } from '../config.js'
import type { CopilotStore, ReviewJob } from './store.js'
import type {
  CompletedReview,
  ExecutedCallAction,
  StoredCallLog,
  TranscriptToolCallEntry,
  VoiceAgentConfig,
} from './types.js'

const recommendationTargetSchema = z.enum([
  'agentPrompt',
  'welcomeMessage',
  'patienceLevel',
  'maxCallDuration',
  'sendUserIdleReminders',
  'reminderAfterIdleTimeSeconds',
  'action.triggerPrompt',
  'action.triggerMessage',
  'action.apiDetails.parameters',
])

const reviewSchema = z.object({
  rating: z.number(),
  outcome: z.enum(['success', 'partial_success', 'failed', 'abandoned', 'inconclusive']),
  failureReason: z
    .enum([
      'user_refused',
      'user_unqualified',
      'agent_misunderstood',
      'tool_failed',
      'no_availability',
      'unsupported_request',
      'call_quality_issue',
      'incomplete_information',
      'other',
    ])
    .optional()
    .nullable(),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'mixed', 'unknown']),
  needsHumanReview: z.boolean(),
  ratingReason: z.string(),
  topFinding: z.string(),
  recommendations: z
    .array(
      z.object({
        target: recommendationTargetSchema,
        title: z.string(),
        reason: z.string(),
        suggestedChange: z.string(),
        actionId: z.string().optional(),
        actionName: z.string().optional(),
      })
    ),
  toolFindings: z
    .array(
      z.object({
        correctness: z.enum(['correct', 'questionable', 'incorrect', 'unknown']),
        reason: z.string(),
        toolCallId: z.string().optional(),
        toolName: z.string().optional(),
        timelineIndex: z.number().optional(),
        recommendationTarget: recommendationTargetSchema.optional(),
      })
    ),
  agentFindings: z
    .array(
      z.object({
        severity: z.enum(['low', 'medium', 'high']),
        title: z.string(),
        detail: z.string(),
        recommendationTarget: recommendationTargetSchema.optional(),
      })
    ),
})

type RawReview = z.infer<typeof reviewSchema>

export class CopilotAnalyzer {
  constructor(
    private readonly config: AppConfig,
    private readonly ghl: HighLevel,
    private readonly store: CopilotStore
  ) {}

  async analyze(job: ReviewJob): Promise<CompletedReview> {
    if (!this.config.openRouterApiKey || !this.config.openRouterModel) {
      throw new Error('OpenRouter analysis is not configured. Set OPENROUTER_API_KEY and OPENROUTER_MODEL.')
    }

    const callLog = await this.getEnrichedCallLog(job)
    const agent = (await this.ghl.voiceAi.getAgent({
      locationId: job.locationId,
      agentId: job.agentId,
    })) as VoiceAgentConfig
    const evidence = buildDeterministicEvidence(callLog, agent, this.store.getAgentDurationP95(job.locationId, job.agentId))
    const openrouter = createOpenRouter({
      apiKey: this.config.openRouterApiKey,
      baseURL: this.config.openRouterBaseUrl,
      compatibility: 'strict',
    })

    const result = await generateObject({
      model: openrouter(this.config.openRouterModel, {
        plugins: [{ id: 'response-healing' }],
      }),
      schema: reviewSchema,
      temperature: 0.1,
      system: [
        'You are a Voice AI observability copilot for HighLevel Voice AI agents.',
        'Your job is to review one completed call against the agent configuration and produce actionable tuning recommendations.',
        'Use only the supplied transcript, tool timeline, executed actions, deterministic evidence, and agent config.',
        'Do not recommend generic dashboard metrics. Recommend changes only to actual configurable agent surfaces.',
        'A rating of 1 means healthy, 2 means needs attention, 3 means critical and should be inspected.',
        'Long duration, silence, or latency are evidence for recommendations, not automatic failures.',
        'For tool findings, attach findings only to tools that have evidence in the timeline.',
      ].join(' '),
      prompt: JSON.stringify(
        {
          callLog: compactCallLog(callLog),
          agent: compactAgent(agent),
          deterministicEvidence: evidence,
          outputRules: {
            recommendationTargets: recommendationTargetSchema.options,
            maxRecommendations: 5,
            maxToolFindings: 12,
            maxAgentFindings: 5,
          },
        },
        null,
        2
      ),
    })

    return normalizeCompletedReview(result.object)
  }

  private async getEnrichedCallLog(job: ReviewJob) {
    const stored = this.store.getCallLog(job.locationId, job.callId)

    if (stored?.transcriptWithToolCalls?.length) {
      return stored
    }

    const fetched = (await this.ghl.voiceAi.getCallLog({
      locationId: job.locationId,
      callId: job.callId,
    })) as StoredCallLog
    const merged = {
      ...stored,
      ...fetched,
      transcriptWithToolCalls: fetched.transcriptWithToolCalls?.length
        ? fetched.transcriptWithToolCalls
        : stored?.transcriptWithToolCalls ?? [],
    }

    this.store.upsertCallLog(job.locationId, merged)

    return merged
  }
}

function normalizeCompletedReview(review: RawReview): CompletedReview {
  return {
    rating: review.rating === 3 ? 3 : review.rating === 2 ? 2 : 1,
    outcome: review.outcome,
    failureReason: review.failureReason ?? null,
    sentiment: review.sentiment,
    needsHumanReview: review.needsHumanReview,
    ratingReason: truncateTo(review.ratingReason, 400) || 'No review reason provided.',
    topFinding: truncateTo(review.topFinding, 180) || 'No top finding provided.',
    recommendations: review.recommendations.slice(0, 5).map((recommendation) => ({
      ...recommendation,
      title: truncateTo(recommendation.title, 120),
      reason: truncateTo(recommendation.reason, 500),
      suggestedChange: truncateTo(recommendation.suggestedChange, 700),
    })),
    toolFindings: review.toolFindings.slice(0, 12).map((finding) => ({
      ...finding,
      reason: truncateTo(finding.reason, 300),
      timelineIndex:
        typeof finding.timelineIndex === 'number' && Number.isFinite(finding.timelineIndex)
          ? Math.max(0, Math.round(finding.timelineIndex))
          : undefined,
    })),
    agentFindings: review.agentFindings.slice(0, 5).map((finding) => ({
      ...finding,
      title: truncateTo(finding.title, 120),
      detail: truncateTo(finding.detail, 500),
    })),
  }
}

function compactCallLog(callLog: StoredCallLog) {
  return {
    id: callLog.id,
    agentId: callLog.agentId,
    createdAt: callLog.createdAt,
    duration: callLog.duration,
    trialCall: callLog.trialCall,
    summary: truncate(callLog.summary, 3000),
    transcript: truncate(callLog.transcript, 18000),
    transcriptWithToolCalls: (callLog.transcriptWithToolCalls ?? []).map((entry, index) => ({
      index,
      role: entry.role,
      content: truncate(entry.content, 1200),
      startTime: entry.startTime,
      endTime: entry.endTime,
      toolName: entry.toolName,
      toolCallId: entry.toolCallId,
      toolType: entry.toolType,
      toolArguments: entry.toolArguments,
    })),
    executedCallActions: callLog.executedCallActions ?? [],
    extractedData: callLog.extractedData,
  }
}

function compactAgent(agent: VoiceAgentConfig) {
  return {
    id: agent.id,
    agentName: agent.agentName,
    businessName: agent.businessName,
    welcomeMessage: truncate(agent.welcomeMessage, 2000),
    agentPrompt: truncate(agent.agentPrompt, 16000),
    language: agent.language,
    patienceLevel: agent.patienceLevel,
    maxCallDuration: agent.maxCallDuration,
    sendUserIdleReminders: agent.sendUserIdleReminders,
    reminderAfterIdleTimeSeconds: agent.reminderAfterIdleTimeSeconds,
    timezone: agent.timezone,
    actions: (agent.actions ?? []).map((action) => ({
      id: action.id,
      actionType: action.actionType,
      name: action.name,
      actionParameters: action.actionParameters,
    })),
  }
}

function buildDeterministicEvidence(callLog: StoredCallLog, agent: VoiceAgentConfig, agentP95Duration: number | null) {
  const timeline = [...(callLog.transcriptWithToolCalls ?? [])]
    .map((entry, index) => ({
      index,
      entry,
      startTime: parseRelativeSeconds(entry.startTime),
      endTime: parseRelativeSeconds(entry.endTime),
    }))
    .filter((item) => item.startTime !== null)
    .sort((left, right) => left.startTime! - right.startTime! || left.index - right.index)

  const gaps = []

  for (let index = 1; index < timeline.length; index += 1) {
    const previousEnd = timeline[index - 1].endTime ?? timeline[index - 1].startTime
    const currentStart = timeline[index].startTime

    if (previousEnd !== null && currentStart !== null && currentStart > previousEnd) {
      gaps.push({
        afterIndex: timeline[index - 1].index,
        beforeIndex: timeline[index].index,
        seconds: roundSeconds(currentStart - previousEnd),
      })
    }
  }

  const toolLatencies = (callLog.transcriptWithToolCalls ?? [])
    .map((entry, index) => toToolLatency(entry, index))
    .filter((item) => item !== null)
  const actionLatencies = (callLog.executedCallActions ?? [])
    .map(toActionLatency)
    .filter((item) => item !== null)
  const maxCallDuration = typeof agent.maxCallDuration === 'number' ? agent.maxCallDuration : null

  return {
    callDurationSeconds: callLog.duration,
    agentP95DurationSeconds: agentP95Duration,
    durationVsAgentP95Seconds: agentP95Duration === null ? null : roundSeconds(callLog.duration - agentP95Duration),
    maxCallDurationSeconds: maxCallDuration,
    durationVsMaxCallDurationPercent:
      maxCallDuration && maxCallDuration > 0 ? Math.round((callLog.duration / maxCallDuration) * 100) : null,
    silenceGaps: {
      maxGapSeconds: gaps.length ? Math.max(...gaps.map((gap) => gap.seconds)) : 0,
      totalGapSeconds: roundSeconds(gaps.reduce((total, gap) => total + gap.seconds, 0)),
      gapsOverFiveSeconds: gaps.filter((gap) => gap.seconds >= 5),
    },
    toolLatencies,
    actionLatencies,
    toolCallsPerMinute: callLog.duration
      ? roundSeconds(((callLog.transcriptWithToolCalls ?? []).filter((entry) => entry.role === 'action_executed').length /
          callLog.duration) *
          60)
      : 0,
  }
}

function toToolLatency(entry: TranscriptToolCallEntry, index: number) {
  if (entry.role !== 'action_executed') {
    return null
  }

  const startTime = parseRelativeSeconds(entry.startTime)
  const endTime = parseRelativeSeconds(entry.endTime)

  return {
    index,
    toolName: entry.toolName,
    toolCallId: entry.toolCallId,
    toolType: entry.toolType,
    latencySeconds: startTime === null || endTime === null ? null : roundSeconds(Math.max(0, endTime - startTime)),
  }
}

function toActionLatency(action: ExecutedCallAction) {
  const triggered = parseDateMs(action.triggerReceivedAt)
  const executed = parseDateMs(action.executedAt)

  if (triggered === null || executed === null) {
    return null
  }

  return {
    actionId: action.actionId,
    actionName: action.actionName,
    actionType: action.actionType,
    latencySeconds: roundSeconds(Math.max(0, executed - triggered) / 1000),
  }
}

function parseRelativeSeconds(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null
}

function parseDateMs(value?: string) {
  if (!value) {
    return null
  }

  const parsed = new Date(value).getTime()

  return Number.isFinite(parsed) ? parsed : null
}

function roundSeconds(value: number) {
  return Math.round(value * 1000) / 1000
}

function truncate(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return ''
  }

  return truncateTo(value, maxLength)
}

function truncateTo(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}
