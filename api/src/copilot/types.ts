export type ReviewStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type ReviewOutcome = 'success' | 'partial_success' | 'failed' | 'abandoned' | 'inconclusive'

export type ReviewSentiment = 'positive' | 'neutral' | 'negative' | 'mixed' | 'unknown'

export type FailureReason =
  | 'user_refused'
  | 'user_unqualified'
  | 'agent_misunderstood'
  | 'tool_failed'
  | 'no_availability'
  | 'unsupported_request'
  | 'call_quality_issue'
  | 'incomplete_information'
  | 'other'

export type RecommendationTarget =
  | 'agentPrompt'
  | 'welcomeMessage'
  | 'patienceLevel'
  | 'maxCallDuration'
  | 'sendUserIdleReminders'
  | 'reminderAfterIdleTimeSeconds'
  | 'action.triggerPrompt'
  | 'action.triggerMessage'
  | 'action.apiDetails.parameters'

export type ToolCorrectness = 'correct' | 'questionable' | 'incorrect' | 'unknown'

export type ReviewRecommendation = {
  target: RecommendationTarget
  title: string
  reason: string
  suggestedChange: string
  actionId?: string
  actionName?: string
}

export type ToolFinding = {
  correctness: ToolCorrectness
  reason: string
  toolCallId?: string
  toolName?: string
  timelineIndex?: number
  recommendationTarget?: RecommendationTarget
}

export type AgentFinding = {
  severity: 'low' | 'medium' | 'high'
  title: string
  detail: string
  recommendationTarget?: RecommendationTarget
}

export type CompletedReview = {
  rating: 1 | 2 | 3
  outcome: ReviewOutcome
  failureReason: FailureReason | null
  sentiment: ReviewSentiment
  needsHumanReview: boolean
  ratingReason: string
  topFinding: string
  recommendations: ReviewRecommendation[]
  toolFindings: ToolFinding[]
  agentFindings: AgentFinding[]
}

export type PublicReview = Partial<CompletedReview> & {
  status: ReviewStatus
  errorMessage?: string
  updatedAt: string
}

export type PublicCopilotSummary = {
  reviewsCompleted: number
  reviewsProcessing: number
  reviewsQueued: number
  reviewsFailed: number
  needsAttention: number
  critical: number
  topAgentFinding?: AgentFinding
  dashboardKpis: {
    analyzedCalls: number
    successRate: number | null
    completionQuality: number | null
    healthyCallRate: number | null
    positiveSentimentRate: number | null
    toolAccuracyRate: number | null
  }
}

export type TranscriptToolCallEntry = {
  role?: 'agent' | 'user' | 'action_executed' | string
  content?: string
  startTime?: number
  endTime?: number
  toolName?: string
  toolCallId?: string
  toolType?: string
  toolArguments?: unknown
}

export type ExecutedCallAction = {
  actionId?: string
  actionName?: string
  actionType?: string
  actionParameters?: unknown
  executedAt?: string
  triggerReceivedAt?: string
}

export type StoredCallLog = {
  id: string
  contactId?: string
  agentId: string
  isAgentDeleted?: boolean
  fromNumber?: string
  createdAt: string
  duration: number
  trialCall?: boolean
  executedCallActions?: ExecutedCallAction[]
  summary?: string
  transcript?: string
  transcriptWithToolCalls?: TranscriptToolCallEntry[]
  transcriptPreview?: string
  translation?: unknown
  extractedData?: unknown
  messageId?: string
}

export type VoiceAgentConfig = {
  id: string
  locationId: string
  agentName: string
  businessName: string
  welcomeMessage: string
  agentPrompt: string
  voiceId: string
  language: string
  patienceLevel: string
  maxCallDuration: number
  sendUserIdleReminders: boolean
  reminderAfterIdleTimeSeconds: number
  timezone: string
  actions: Array<{
    id: string
    actionType: string
    name: string
    actionParameters: unknown
  }>
}
