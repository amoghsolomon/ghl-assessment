export type AuthResponse = {
  token: string
  context: {
    userId: string
    companyId: string
    locationId: string
    role?: string
    type?: string
    email?: string
    userName?: string
  }
}

export type ExecutedCallAction = {
  actionId?: string
  actionName?: string
  actionType?: string
  actionParameters?: unknown
  executedAt?: string
  triggerReceivedAt?: string
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

export type AnalysisStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type Recommendation = {
  target: string
  title: string
  reason: string
  suggestedChange: string
  actionId?: string
  actionName?: string
}

export type ToolFinding = {
  correctness: 'correct' | 'questionable' | 'incorrect' | 'unknown'
  reason: string
  toolCallId?: string
  toolName?: string
  timelineIndex?: number
  recommendationTarget?: string
}

export type AgentFinding = {
  severity: 'low' | 'medium' | 'high'
  title: string
  detail: string
  recommendationTarget?: string
}

export type CallAnalysis = {
  status: AnalysisStatus
  updatedAt: string
  errorMessage?: string
  rating?: 1 | 2 | 3
  outcome?: 'success' | 'partial_success' | 'failed' | 'abandoned' | 'inconclusive'
  failureReason?: string | null
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed' | 'unknown'
  needsHumanReview?: boolean
  ratingReason?: string
  topFinding?: string
  recommendations?: Recommendation[]
  toolFindings?: ToolFinding[]
  agentFindings?: AgentFinding[]
}

export type CopilotSummary = {
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

export type CallLog = {
  id: string
  contactId?: string
  agentId: string
  isAgentDeleted?: boolean
  fromNumber?: string
  createdAt: string
  duration: number
  trialCall?: boolean
  executedCallActions: ExecutedCallAction[]
  summary: string
  transcript: string
  transcriptWithToolCalls: TranscriptToolCallEntry[]
  transcriptPreview: string
  translation?: unknown
  extractedData?: unknown
  messageId?: string
  review?: CallAnalysis
}

export type CallLogsResponse = {
  locationId: string
  total: number
  page: number
  pageSize: number
  copilotSummary?: CopilotSummary
  callLogs: CallLog[]
}

export type CallLogDetailResponse = {
  locationId: string
  callLog: CallLog
}

export type VoiceAgent = {
  id: string
  locationId?: string
  name: string
  businessName?: string
  inboundNumber?: string
  numberPoolId?: string
  language?: string
  timezone?: string
  maxCallDuration?: number
  actionsCount: number
}

export type AgentsResponse = {
  locationId: string
  total: number
  page: number
  pageSize: number
  agents: VoiceAgent[]
}
