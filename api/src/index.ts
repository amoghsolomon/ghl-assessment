import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { cors } from 'hono/cors'
import { Hono } from 'hono'
import { fileURLToPath } from 'node:url'
import {
  appConfig,
  ensureLocationOAuthSession,
  exchangeAuthorizationCode,
  getAuthorizationUrl,
  ghl,
  ghlSessionStorage,
} from './ghl/client.js'
import type { ISessionData } from '@gohighlevel/api-client'
import {
  createAppSessionToken,
  decryptHighLevelUserContext,
  verifyAppSessionToken,
  type HighLevelUserContext,
} from './auth/user-context.js'
import { CopilotAnalyzer } from './copilot/analyzer.js'
import { ReviewQueue } from './copilot/queue.js'
import { CopilotStore } from './copilot/store.js'
import {
  getWebhookEventId,
  isVoiceAiCallEnd,
  parseWebhookPayload,
  verifyWebhookSignature,
} from './copilot/webhooks.js'
import type { StoredCallLog } from './copilot/types.js'

const app = new Hono()
const port = Number(process.env.PORT ?? 3000)
const hostname = process.env.HOST ?? '0.0.0.0'
const widgetDistRoot = fileURLToPath(new URL('../../web-component/dist/', import.meta.url))
const copilotStore = new CopilotStore(appConfig.copilotDbPath)
const copilotAnalyzer = new CopilotAnalyzer(appConfig, ghl, copilotStore)
const reviewQueue = new ReviewQueue(copilotStore, copilotAnalyzer)

app.get('/', (c) => {
  return c.redirect('/embed')
})

app.use('*', cors())

app.use(
  '/widget/*',
  serveStatic({
    root: widgetDistRoot,
    rewriteRequestPath: (path) => path.replace(/^\/widget/, ''),
  })
)

app.get('/health', (c) => {
  return c.json({
    ok: true,
    service: 'voice-ai-observability-copilot',
  })
})

app.get('/oauth/install', (c) => {
  try {
    return c.redirect(getAuthorizationUrl(new URL(c.req.url).origin))
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

app.get('/oauth/callback', async (c) => {
  const code = c.req.query('code')
  const error = c.req.query('error')

  if (error) {
    return c.json({ error }, 400)
  }

  if (!code) {
    return c.json({ error: 'Missing OAuth code' }, 400)
  }

  try {
    const result = await exchangeAuthorizationCode(code, new URL(c.req.url).origin)

    return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HighLevel Connected</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f7f8fa;
        color: #17202a;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        width: min(560px, calc(100vw - 40px));
        padding: 28px;
        border: 1px solid #dde3ea;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 10px 30px rgba(20, 32, 45, 0.08);
      }

      h1 {
        margin: 0 0 10px;
        font-size: 22px;
      }

      p {
        margin: 0;
        color: #526274;
        line-height: 1.5;
      }

      code {
        color: #17202a;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>HighLevel connected</h1>
      <p>Stored OAuth session for <code>${escapeHtml(result.resourceId)}</code>. You can close this tab and return to the sandbox.</p>
    </main>
  </body>
</html>`)
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

app.get('/api/ghl/sessions', async (c) => {
  const sessions = await ghlSessionStorage.getSessionsByApplication()

  return c.json({
    sessions: sessions.map(toPublicSession),
  })
})

app.get('/api/ghl/sessions/:resourceId', async (c) => {
  const session = await ghlSessionStorage.getSession(c.req.param('resourceId'))

  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }

  return c.json({ session: toPublicSession(session) })
})

app.post('/api/auth/ghl-context', async (c) => {
  if (!appConfig.ghlAppSharedSecret) {
    return c.json({ error: 'Missing GHL_APP_SHARED_SECRET' }, 500)
  }

  if (!appConfig.appSessionSecret) {
    return c.json({ error: 'Missing APP_SESSION_SECRET' }, 500)
  }

  const body = await c.req.json<{ encryptedData?: string }>().catch(() => null)

  if (!body?.encryptedData) {
    return c.json({ error: 'Missing encryptedData' }, 400)
  }

  try {
    const userContext = decryptHighLevelUserContext(body.encryptedData, appConfig.ghlAppSharedSecret)
    const locationId = userContext.activeLocation

    if (!locationId) {
      return c.json({ error: 'HighLevel user context does not include activeLocation' }, 400)
    }

    const storedSession = await ensureLocationOAuthSession(locationId, userContext.companyId)

    if (!storedSession) {
      return c.json(
        {
          error: 'No OAuth session stored for this HighLevel location',
          locationId,
          companyId: userContext.companyId,
        },
        403
      )
    }

    if (storedSession.companyId && userContext.companyId && storedSession.companyId !== userContext.companyId) {
      return c.json({ error: 'HighLevel user context does not match stored OAuth session' }, 403)
    }

    const token = createAppSessionToken(userContext, locationId, appConfig.appSessionSecret)

    return c.json({
      token,
      context: toPublicUserContext(userContext, locationId),
    })
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 400)
  }
})

app.post('/webhooks/ghl', async (c) => {
  const rawBody = await c.req.text()

  try {
    if (!verifyWebhookSignature(rawBody, c.req.raw.headers, appConfig)) {
      return c.json({ error: 'Invalid webhook signature' }, 401)
    }

    const payload = parseWebhookPayload(rawBody)

    if (!isVoiceAiCallEnd(payload)) {
      return c.json({ ok: true, ignored: true })
    }

    const eventId = getWebhookEventId(payload)
    copilotStore.recordWebhookEvent(eventId, payload.type ?? payload.eventType ?? 'VoiceAiCallEnd', payload.locationId, payload.id, payload)
    enqueueReviewForCall(payload.locationId, payload)

    return c.json({ ok: true, queued: true })
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 400)
  }
})

app.get('/api/voice-ai/call-logs', async (c) => {
  const appSession = getRequestAppSession(c.req.header('authorization'))

  if (!appSession.ok) {
    return c.json({ error: appSession.error }, 401)
  }

  try {
    const page = parsePositiveInteger(c.req.query('page'), 1)
    const pageSize = parsePageSize(c.req.query('pageSize'), 20)
    const response = await ghl.voiceAi.getCallLogs({
      locationId: appSession.value.locationId,
      agentId: optionalQuery(c.req.query('agentId')),
      contactId: optionalQuery(c.req.query('contactId')),
      callType: optionalQuery(c.req.query('callType')),
      actionType: optionalQuery(c.req.query('actionType')),
      sortBy: optionalQuery(c.req.query('sortBy')) ?? 'createdAt',
      sort: parseSortOrder(c.req.query('sort')),
      startDate: parseOptionalNumber(c.req.query('startDate')),
      endDate: parseOptionalNumber(c.req.query('endDate')),
      page,
      pageSize,
    })

    const callLogs = response.callLogs.map(toPublicCallLog)
    const reviews = ingestCallLogs(appSession.value.locationId, callLogs)

    return c.json({
      locationId: appSession.value.locationId,
      total: response.total,
      page: response.page,
      pageSize: response.pageSize,
      copilotSummary: copilotStore.summarizeReviews(
        callLogs.map((callLog) => reviews.get(callLog.id)),
        callLogs
      ),
      callLogs: callLogs.map((callLog) => ({
        ...callLog,
        review: reviews.get(callLog.id),
      })),
    })
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

app.get('/api/voice-ai/call-logs/:callId', async (c) => {
  const appSession = getRequestAppSession(c.req.header('authorization'))

  if (!appSession.ok) {
    return c.json({ error: appSession.error }, 401)
  }

  try {
    const response = await ghl.voiceAi.getCallLog({
      locationId: appSession.value.locationId,
      callId: c.req.param('callId'),
    })

    const callLog = toPublicCallLog(response)
    enqueueReviewForCall(appSession.value.locationId, callLog)

    return c.json({
      locationId: appSession.value.locationId,
      callLog: {
        ...callLog,
        review: copilotStore.getReview(appSession.value.locationId, callLog.id),
      },
    })
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

app.post('/api/voice-ai/call-logs/:callId/review/retry', async (c) => {
  const appSession = getRequestAppSession(c.req.header('authorization'))

  if (!appSession.ok) {
    return c.json({ error: appSession.error }, 401)
  }

  try {
    const response = await ghl.voiceAi.getCallLog({
      locationId: appSession.value.locationId,
      callId: c.req.param('callId'),
    })
    const callLog = toPublicCallLog(response)

    copilotStore.retryReview(appSession.value.locationId, callLog)
    reviewQueue.kick()

    return c.json({
      locationId: appSession.value.locationId,
      callLog: {
        ...callLog,
        review: copilotStore.getReview(appSession.value.locationId, callLog.id),
      },
    })
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

app.get('/api/voice-ai/agents', async (c) => {
  const appSession = getRequestAppSession(c.req.header('authorization'))

  if (!appSession.ok) {
    return c.json({ error: appSession.error }, 401)
  }

  try {
    const page = parsePositiveInteger(c.req.query('page'), 1)
    const pageSize = parsePageSize(c.req.query('pageSize'), 50)
    const response = await ghl.voiceAi.getAgents({
      locationId: appSession.value.locationId,
      page,
      pageSize,
      query: optionalQuery(c.req.query('query')),
    })

    return c.json({
      locationId: appSession.value.locationId,
      total: response.total,
      page: response.page,
      pageSize: response.pageSize,
      agents: response.agents.map(toPublicVoiceAgent),
    })
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

app.get('/api/copilot/summary', (c) => {
  const locationId = c.req.query('locationId') ?? 'sandbox-location'
  const agentId = c.req.query('agentId') ?? 'all'

  return c.json({
    locationId,
    agentId,
    generatedAt: new Date().toISOString(),
    callsAnalyzed: 128,
    agentsObserved: 6,
    averageGoalScore: 82,
    failureRate: 14,
    monitorSignals: [
      {
        label: 'Qualification missed',
        severity: 'critical',
        count: 9,
        detail: 'Lead budget was not confirmed before transfer in recent inbound calls.',
      },
      {
        label: 'Long silence',
        severity: 'warning',
        count: 7,
        detail: 'Several calls had pauses above the expected recovery threshold.',
      },
      {
        label: 'Booking intent captured',
        severity: 'healthy',
        count: 41,
        detail: 'Agent consistently recognized appointment intent and offered slots.',
      },
    ],
    recommendations: [
      'Add an explicit budget confirmation checkpoint before warm transfer.',
      'Tighten silence recovery instructions with a one-sentence fallback prompt.',
      'Review failed transfer calls and add two examples to the agent goal set.',
    ],
    useActions: [
      {
        callId: 'call_1042',
        timestamp: '03:18',
        reason: 'Human follow-up needed for pricing objection.',
      },
      {
        callId: 'call_1091',
        timestamp: '01:47',
        reason: 'Script training candidate for missed qualification.',
      },
    ],
  })
})

app.get('/embed', (c) => {
  return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Observability Copilot Embed</title>
    <style>
      body {
        margin: 0;
        background: #f7f8fa;
        color: #17202a;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      main {
        max-width: 1180px;
        margin: 0 auto;
        padding: 32px;
      }
    </style>
  </head>
  <body>
    <main>
      <observability-copilot api-base-url="" app-id="${escapeHtml(appConfig.ghlAppId ?? '')}"></observability-copilot>
    </main>
    <script type="module" src="/widget/observability-copilot.js"></script>
  </body>
</html>`)
})

await ghlSessionStorage.init()
copilotStore.init()
reviewQueue.start()

serve({
  fetch: app.fetch,
  hostname,
  port,
}, (info) => {
  console.log(`Server is running on http://${hostname}:${info.port}`)
})

function toPublicSession(session: ISessionData) {
  return {
    userType: session.userType,
    companyId: session.companyId,
    locationId: session.locationId,
    userId: session.userId,
    scope: session.scope,
    tokenType: session.token_type,
    expireAt: session.expire_at,
    hasAccessToken: Boolean(session.access_token),
    hasRefreshToken: Boolean(session.refresh_token),
  }
}

function toPublicUserContext(context: HighLevelUserContext, locationId: string) {
  return {
    userId: context.userId,
    companyId: context.companyId,
    locationId,
    role: context.role,
    type: context.type,
    email: context.email,
    userName: context.userName,
  }
}

function ingestCallLogs(locationId: string, callLogs: StoredCallLog[]) {
  let queuedReview = false

  for (const callLog of callLogs) {
    queuedReview = enqueueReviewForCall(locationId, callLog) || queuedReview
  }

  if (queuedReview) {
    reviewQueue.kick()
  }

  return copilotStore.getReviews(
    locationId,
    callLogs.map((callLog) => callLog.id)
  )
}

function enqueueReviewForCall(locationId: string, callLog: StoredCallLog) {
  copilotStore.upsertCallLog(locationId, callLog)
  const queuedReview = copilotStore.ensureReviewQueued(locationId, callLog)

  if (queuedReview) {
    reviewQueue.kick()
  }

  return queuedReview
}

function toPublicCallLog(callLog: {
  id: string
  contactId?: string
  agentId: string
  isAgentDeleted?: boolean
  fromNumber?: string
  createdAt: string
  duration: number
  trialCall?: boolean
  executedCallActions?: StoredCallLog['executedCallActions']
  summary?: string
  transcript?: string
  transcriptWithToolCalls?: StoredCallLog['transcriptWithToolCalls']
  translation?: unknown
  extractedData?: unknown
  messageId?: string
}): StoredCallLog {
  return {
    id: callLog.id,
    contactId: callLog.contactId,
    agentId: callLog.agentId,
    isAgentDeleted: callLog.isAgentDeleted,
    fromNumber: callLog.fromNumber,
    createdAt: callLog.createdAt,
    duration: callLog.duration,
    trialCall: callLog.trialCall,
    executedCallActions: callLog.executedCallActions ?? [],
    summary: callLog.summary ?? '',
    transcript: callLog.transcript ?? '',
    transcriptWithToolCalls: callLog.transcriptWithToolCalls ?? [],
    transcriptPreview: (callLog.transcript ?? '').slice(0, 240),
    translation: callLog.translation,
    extractedData: callLog.extractedData,
    messageId: callLog.messageId,
  }
}

function toPublicVoiceAgent(agent: {
  id: string
  locationId?: string
  agentName?: string
  businessName?: string
  inboundNumber?: string
  numberPoolId?: string
  language?: string
  timezone?: string
  maxCallDuration?: number
  actions?: unknown[]
}) {
  return {
    id: agent.id,
    locationId: agent.locationId,
    name: agent.agentName ?? agent.id,
    businessName: agent.businessName,
    inboundNumber: agent.inboundNumber,
    numberPoolId: agent.numberPoolId,
    language: agent.language,
    timezone: agent.timezone,
    maxCallDuration: agent.maxCallDuration,
    actionsCount: agent.actions?.length ?? 0,
  }
}

function getRequestAppSession(authorizationHeader?: string) {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return { ok: false as const, error: 'Missing app session token' }
  }

  if (!appConfig.appSessionSecret) {
    return { ok: false as const, error: 'Missing APP_SESSION_SECRET' }
  }

  try {
    return {
      ok: true as const,
      value: verifyAppSessionToken(authorizationHeader.slice('Bearer '.length), appConfig.appSessionSecret),
    }
  } catch (error) {
    return { ok: false as const, error: getErrorMessage(error) }
  }
}

function optionalQuery(value?: string) {
  return value && value !== 'all' ? value : undefined
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback
  }

  return parsed
}

function parsePageSize(value: string | undefined, fallback: number) {
  return Math.min(parsePositiveInteger(value, fallback), 50)
}

function parseOptionalNumber(value: string | undefined) {
  if (!value) {
    return undefined
  }

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : undefined
}

function parseSortOrder(value: string | undefined) {
  if (value === 'asc') {
    return 'ascend'
  }

  if (value === 'desc') {
    return 'descend'
  }

  return optionalQuery(value) ?? 'descend'
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error'
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
