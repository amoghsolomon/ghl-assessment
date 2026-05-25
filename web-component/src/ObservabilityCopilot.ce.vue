<script setup lang="ts">
import { computed, h, onMounted, ref, useShadowRoot, watch } from 'vue'
import {
  NAlert,
  NButton,
  NCard,
  NCode,
  NConfigProvider,
  NCollapse,
  NCollapseItem,
  NDataTable,
  NDatePicker,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NPagination,
  NSelect,
  NSpace,
  NSpin,
  NStatistic,
  NTag,
  type DataTableColumns,
  type GlobalThemeOverrides,
  type SelectOption,
} from 'naive-ui'

declare global {
  interface Window {
    exposeSessionDetails?: (appId: string) => Promise<string>
  }
}

type AuthResponse = {
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

type ExecutedCallAction = {
  actionId?: string
  actionName?: string
  actionType?: string
  actionParameters?: unknown
  executedAt?: string
  triggerReceivedAt?: string
}

type TranscriptToolCallEntry = {
  role?: 'agent' | 'user' | 'action_executed' | string
  content?: string
  startTime?: number
  endTime?: number
  toolName?: string
  toolCallId?: string
  toolType?: string
  toolArguments?: unknown
}

type CallLog = {
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
}

type CallLogsResponse = {
  locationId: string
  total: number
  page: number
  pageSize: number
  callLogs: CallLog[]
}

type CallLogDetailResponse = {
  locationId: string
  callLog: CallLog
}

type VoiceAgent = {
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

type AgentsResponse = {
  locationId: string
  total: number
  page: number
  pageSize: number
  agents: VoiceAgent[]
}

const props = withDefaults(
  defineProps<{
    apiBaseUrl?: string
    appId?: string
    agentId?: string
  }>(),
  {
    apiBaseUrl: '',
    agentId: 'all',
  }
)

const themeOverrides: GlobalThemeOverrides = {
  common: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontFamilyMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    primaryColor: '#155eef',
    primaryColorHover: '#2970ff',
    primaryColorPressed: '#004eeb',
    primaryColorSuppl: '#155eef',
    infoColor: '#175cd3',
    infoColorHover: '#155eef',
    infoColorPressed: '#004eeb',
    infoColorSuppl: '#175cd3',
    borderColor: '#eaecf0',
    dividerColor: '#eaecf0',
    hoverColor: '#f9fafb',
    tableHeaderColor: '#f9fafb',
    tableColorHover: '#f9fafb',
    textColor1: '#101828',
    textColor2: '#344054',
    textColor3: '#667085',
    placeholderColor: '#98a2b3',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    heightMedium: '40px',
    fontSize: '14px',
    fontSizeMedium: '14px',
    lineHeight: '1.5',
  },
  Button: {
    heightMedium: '40px',
    borderRadiusMedium: '8px',
    fontSizeMedium: '14px',
    textColor: '#344054',
    textColorHover: '#344054',
    textColorPressed: '#344054',
    textColorFocus: '#344054',
    border: '1px solid #d0d5dd',
    borderHover: '1px solid #d0d5dd',
    borderPressed: '1px solid #84adff',
    borderFocus: '1px solid #84adff',
    color: '#ffffff',
    colorHover: '#f9fafb',
    colorPressed: '#f9fafb',
    colorFocus: '#ffffff',
  },
  Card: {
    borderColor: '#eaecf0',
    borderRadius: '8px',
    color: '#ffffff',
    paddingSmall: '8px 24px',
  },
  DataTable: {
    borderRadius: '8px',
    borderColor: '#eaecf0',
    thColor: '#f9fafb',
    thTextColor: '#667085',
    thFontWeight: '500',
    thPaddingMedium: '12px 24px',
    tdPaddingMedium: '14px 24px',
    tdTextColor: '#344054',
    tdColor: '#ffffff',
    tdColorHover: '#f9fafb',
    emptyPadding: '54px 0',
  },
  Drawer: {
    borderRadius: '8px',
    color: '#ffffff',
    textColor: '#344054',
    titleTextColor: '#101828',
    headerBorderBottom: '1px solid #eaecf0',
    bodyPadding: '0',
  },
  Descriptions: {
    thColor: '#f9fafb',
    thTextColor: '#667085',
    tdTextColor: '#101828',
    borderColor: '#eaecf0',
  },
}

const shadowRoot = useShadowRoot()
const portalTarget = ref<HTMLElement | null>(null)
const overlayTarget = computed(() => portalTarget.value ?? undefined)
const auth = ref<AuthResponse | null>(null)
const agents = ref<AgentsResponse | null>(null)
const callLogs = ref<CallLogsResponse | null>(null)
const selectedCallLog = ref<CallLog | null>(null)
const selectedAgentId = ref(props.agentId)
const dateRange = ref<[number, number] | null>([startOfDay(daysAgo(30)), endOfDay(new Date())])
const page = ref(1)
const pageSize = 10

const authenticating = ref(false)
const agentsLoading = ref(false)
const logsLoading = ref(false)
const detailLoading = ref(false)
const authError = ref('')
const agentsError = ref('')
const callLogsError = ref('')
const detailError = ref('')

const baseUrl = computed(() => props.apiBaseUrl.replace(/\/$/, ''))
const visibleLogs = computed(() => callLogs.value?.callLogs ?? [])
const totalPages = computed(() => Math.max(1, Math.ceil((callLogs.value?.total ?? 0) / pageSize)))
const busy = computed(() => authenticating.value || agentsLoading.value || logsLoading.value)
const detailVisible = computed({
  get: () => Boolean(selectedCallLog.value),
  set: (value: boolean) => {
    if (!value) {
      selectedCallLog.value = null
    }
  },
})
const apiHeaders = computed(() => {
  const headers: Record<string, string> = {}

  if (baseUrl.value.includes('ngrok-free.app')) {
    headers['ngrok-skip-browser-warning'] = 'true'
  }

  return headers
})

const agentOptions = computed<SelectOption[]>(() => {
  const options: SelectOption[] = [{ label: 'All Agents', value: 'all' }]

  for (const agent of agents.value?.agents ?? []) {
    options.push({ label: agent.name, value: agent.id })
  }

  for (const callLog of visibleLogs.value) {
    if (!options.some((option) => option.value === callLog.agentId)) {
      options.push({ label: callLog.agentId, value: callLog.agentId })
    }
  }

  return options
})

const totalCalls = computed(() => callLogs.value?.total ?? 0)
const returnedCalls = computed(() => visibleLogs.value.length)
const totalDuration = computed(() => visibleLogs.value.reduce((total, callLog) => total + safeDuration(callLog.duration), 0))
const averageDuration = computed(() => (returnedCalls.value ? Math.round(totalDuration.value / returnedCalls.value) : 0))
const actionsTriggered = computed(() =>
  visibleLogs.value.reduce((total, callLog) => total + callLog.executedCallActions.length, 0)
)
const trialCalls = computed(() => visibleLogs.value.filter((callLog) => callLog.trialCall).length)
const transcriptCoverage = computed(() => {
  if (!returnedCalls.value) {
    return 0
  }

  const withTranscript = visibleLogs.value.filter((callLog) => Boolean(callLog.transcript)).length

  return Math.round((withTranscript / returnedCalls.value) * 100)
})
const selectedAgentLabel = computed(() => getAgentName(selectedAgentId.value))
const detailSignals = computed(() => {
  if (!selectedCallLog.value) {
    return []
  }

  return [
    {
      label: 'Summary',
      value: selectedCallLog.value.summary ? 'Available' : 'Missing',
    },
    {
      label: 'Transcript',
      value: selectedCallLog.value.transcript ? `${countWords(selectedCallLog.value.transcript)} words` : 'Missing',
    },
    {
      label: 'Actions',
      value: String(selectedCallLog.value.executedCallActions.length),
    },
    {
      label: 'Extracted data',
      value: countDataFields(selectedCallLog.value.extractedData)
        ? `${countDataFields(selectedCallLog.value.extractedData)} fields`
        : 'None',
    },
    {
      label: 'Trial call',
      value: selectedCallLog.value.trialCall ? 'Yes' : 'No',
    },
    {
      label: 'Agent status',
      value: selectedCallLog.value.isAgentDeleted ? 'Deleted' : 'Active',
    },
  ]
})
const actionTimeline = computed(() => {
  return [...(selectedCallLog.value?.executedCallActions ?? [])]
    .map((action, index) => ({
      action,
      index,
      triggerAt: parseDateMs(action.triggerReceivedAt),
      executedAt: parseDateMs(action.executedAt),
    }))
    .sort((a, b) => {
      const left = a.triggerAt ?? a.executedAt ?? Number.MAX_SAFE_INTEGER
      const right = b.triggerAt ?? b.executedAt ?? Number.MAX_SAFE_INTEGER

      return left - right || a.index - b.index
    })
    .map((item, timelineIndex, timeline) => ({
      ...item,
      timelineIndex,
      gapFromPrevious: timelineIndex === 0 ? null : getTimelineGap(timeline[timelineIndex - 1], item),
    }))
})
const transcriptWaterfall = computed(() => {
  return [...(selectedCallLog.value?.transcriptWithToolCalls ?? [])]
    .map((entry, index) => {
      const startTime = parseRelativeSeconds(entry.startTime)
      const endTime = parseRelativeSeconds(entry.endTime)

      return {
        entry,
        index,
        startTime,
        endTime,
        duration: startTime === null || endTime === null ? null : Math.max(0, endTime - startTime),
      }
    })
    .sort((a, b) => {
      const left = a.startTime ?? Number.MAX_SAFE_INTEGER
      const right = b.startTime ?? Number.MAX_SAFE_INTEGER

      return left - right || a.index - b.index
    })
})
const transcriptWaterfallRange = computed(() => {
  const maxEntryTime = transcriptWaterfall.value.reduce((maxTime, item) => {
    return Math.max(maxTime, item.endTime ?? item.startTime ?? 0)
  }, 0)
  const callDuration = selectedCallLog.value?.duration ?? 0

  return Math.max(1, maxEntryTime, callDuration)
})

const callLogColumns = computed<DataTableColumns<CallLog>>(() => [
  {
    title: 'Agent Name',
    key: 'agentId',
    minWidth: 220,
    render: (row) => h('div', { class: 'cell-main' }, getAgentName(row.agentId)),
  },
  {
    title: 'Contact',
    key: 'contactId',
    minWidth: 190,
    render: (row) => h('div', { class: 'cell-main' }, row.trialCall ? 'Trial call' : '-'),
  },
  {
    title: 'From Number',
    key: 'fromNumber',
    minWidth: 150,
    render: (row) => row.fromNumber || '-',
  },
  {
    title: 'Date and Time',
    key: 'createdAt',
    minWidth: 170,
    render: (row) => formatDate(row.createdAt),
  },
  {
    title: 'Duration',
    key: 'duration',
    minWidth: 110,
    render: (row) => formatDuration(row.duration),
  },
  {
    title: 'Actions Triggered',
    key: 'executedCallActions',
    minWidth: 150,
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, bordered: false },
        { default: () => String(row.executedCallActions.length) }
      ),
  },
  {
    title: 'Insights',
    key: 'insights',
    minWidth: 230,
    render: (row) => {
      const tags = [
        row.summary ? { label: 'Summary', type: 'info' as const } : null,
        row.transcript ? { label: 'Transcript', type: 'success' as const } : null,
        hasData(row.extractedData) ? { label: 'Data', type: 'warning' as const } : null,
      ].filter(Boolean) as Array<{ label: string; type: 'info' | 'success' | 'warning' }>

      if (!tags.length) {
        return '-'
      }

      return h(
        NSpace,
        { size: 6, wrap: true },
        {
          default: () =>
            tags.map((tag) =>
              h(NTag, { size: 'small', type: tag.type, bordered: false }, { default: () => tag.label })
            ),
        }
      )
    },
  },
])

watch(
  () => props.agentId,
  (agentId) => {
    selectedAgentId.value = agentId
  }
)

async function authenticate() {
  authenticating.value = true
  authError.value = ''

  try {
    const encryptedData = await getEncryptedUserContext()
    const response = await fetch(`${baseUrl.value}/api/auth/ghl-context`, {
      method: 'POST',
      headers: {
        ...apiHeaders.value,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ encryptedData }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.error ?? `Authentication failed with ${response.status}`)
    }

    auth.value = await response.json()
  } catch (err) {
    authError.value = err instanceof Error ? err.message : 'Unable to authenticate HighLevel user'
  } finally {
    authenticating.value = false
  }
}

async function loadAgents() {
  if (!auth.value) {
    return
  }

  agentsLoading.value = true
  agentsError.value = ''

  try {
    const params = new URLSearchParams({
      page: '1',
      pageSize: '50',
    })
    const response = await fetch(`${baseUrl.value}/api/voice-ai/agents?${params.toString()}`, {
      headers: authHeaders(),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.error ?? `Agents request failed with ${response.status}`)
    }

    agents.value = await response.json()
  } catch (err) {
    agentsError.value = err instanceof Error ? err.message : 'Unable to load Voice AI agents'
  } finally {
    agentsLoading.value = false
  }
}

async function loadCallLogs() {
  if (!auth.value) {
    return
  }

  logsLoading.value = true
  callLogsError.value = ''

  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize),
      sortBy: 'createdAt',
      sort: 'descend',
    })

    if (selectedAgentId.value !== 'all') {
      params.set('agentId', selectedAgentId.value)
    }

    if (dateRange.value) {
      params.set('startDate', String(dateRange.value[0]))
      params.set('endDate', String(dateRange.value[1]))
    }

    const response = await fetch(`${baseUrl.value}/api/voice-ai/call-logs?${params.toString()}`, {
      headers: authHeaders(),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.error ?? `Call logs request failed with ${response.status}`)
    }

    callLogs.value = await response.json()
    syncSelectedLog()
  } catch (err) {
    callLogsError.value = err instanceof Error ? err.message : 'Unable to load call logs'
  } finally {
    logsLoading.value = false
  }
}

async function loadCallLogDetail(callLog: CallLog) {
  if (!auth.value) {
    return
  }

  selectedCallLog.value = callLog
  detailLoading.value = true
  detailError.value = ''

  try {
    const response = await fetch(`${baseUrl.value}/api/voice-ai/call-logs/${encodeURIComponent(callLog.id)}`, {
      headers: authHeaders(),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.error ?? `Call log detail request failed with ${response.status}`)
    }

    const payload = (await response.json()) as CallLogDetailResponse
    const detailTranscriptWithToolCalls = payload.callLog.transcriptWithToolCalls ?? []

    selectedCallLog.value = {
      ...callLog,
      ...payload.callLog,
      transcriptWithToolCalls: detailTranscriptWithToolCalls.length
        ? detailTranscriptWithToolCalls
        : callLog.transcriptWithToolCalls ?? [],
    }
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : 'Unable to load call log details'
  } finally {
    detailLoading.value = false
  }
}

async function refreshAll() {
  if (!auth.value) {
    await authenticate()
  }

  if (!auth.value) {
    return
  }

  await Promise.all([loadAgents(), loadCallLogs()])
}

async function handleAgentUpdate(value: string | number | null) {
  selectedAgentId.value = typeof value === 'string' ? value : 'all'
  page.value = 1
  selectedCallLog.value = null
  await loadCallLogs()
}

async function handleDateRangeUpdate(value: number | [number, number] | null) {
  dateRange.value = Array.isArray(value) ? value : null
  page.value = 1
  selectedCallLog.value = null
  await loadCallLogs()
}

async function goToPage(nextPage: number) {
  page.value = Math.min(Math.max(nextPage, 1), totalPages.value)
  await loadCallLogs()
}

function authHeaders() {
  return {
    ...apiHeaders.value,
    Authorization: `Bearer ${auth.value?.token ?? ''}`,
  }
}

async function getEncryptedUserContext() {
  if (window.exposeSessionDetails) {
    if (!props.appId) {
      throw new Error('Missing app-id attribute for HighLevel session context')
    }

    const encryptedData = await window.exposeSessionDetails(props.appId)

    if (!encryptedData || typeof encryptedData !== 'string') {
      throw new Error('HighLevel did not return encrypted session data. Check the app-id attribute.')
    }

    return encryptedData
  }

  if (window.parent !== window) {
    return requestUserContextFromParent()
  }

  throw new Error('HighLevel session context is not available in this page')
}

function requestUserContextFromParent() {
  return new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', messageHandler)
      reject(new Error('Timed out waiting for HighLevel user context'))
    }, 5000)

    const messageHandler = ({ data }: MessageEvent) => {
      if (data?.message !== 'REQUEST_USER_DATA_RESPONSE') {
        return
      }

      window.clearTimeout(timeout)
      window.removeEventListener('message', messageHandler)
      resolve(data.payload)
    }

    window.addEventListener('message', messageHandler)
    window.parent.postMessage({ message: 'REQUEST_USER_DATA' }, '*')
  })
}

function rowProps(callLog: CallLog) {
  return {
    class: selectedCallLog.value?.id === callLog.id ? 'selected-row' : '',
    tabindex: 0,
    onClick: () => loadCallLogDetail(callLog),
    onKeydown: (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        loadCallLogDetail(callLog)
      }
    },
  }
}

function syncSelectedLog() {
  if (!selectedCallLog.value) {
    return
  }

  const updatedLog = visibleLogs.value.find((callLog) => callLog.id === selectedCallLog.value?.id)

  selectedCallLog.value = updatedLog ?? null
}

function getAgentName(agentId?: string) {
  if (!agentId) {
    return '-'
  }

  return agents.value?.agents.find((agent) => agent.id === agentId)?.name ?? agentId
}

function formatDuration(seconds: number) {
  const totalSeconds = safeDuration(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }

  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`
}

function safeDuration(seconds: number) {
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0
}

function formatDate(value?: string) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function daysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)

  return date
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime()
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function countDataFields(value: unknown): number {
  if (!value) {
    return 0
  }

  if (Array.isArray(value)) {
    return value.length
  }

  if (typeof value === 'object') {
    return Object.keys(value).length
  }

  return 1
}

function hasData(value: unknown) {
  return countDataFields(value) > 0
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function parseRelativeSeconds(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return Math.max(0, value)
}

function parseDateMs(value?: string) {
  if (!value) {
    return null
  }

  const parsed = new Date(value).getTime()

  return Number.isFinite(parsed) ? parsed : null
}

function getTimelineGap(
  previous: { executedAt: number | null; triggerAt: number | null },
  current: { triggerAt: number | null; executedAt: number | null }
) {
  const previousEnd = previous.executedAt ?? previous.triggerAt
  const currentStart = current.triggerAt ?? current.executedAt

  if (previousEnd === null || currentStart === null) {
    return null
  }

  return Math.max(0, currentStart - previousEnd)
}

function formatDurationMs(milliseconds: number | null) {
  if (milliseconds === null) {
    return '-'
  }

  const seconds = milliseconds / 1000

  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`
  }

  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)

  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`
}

function formatActionLatency(action: ExecutedCallAction) {
  if (!action.executedAt || !action.triggerReceivedAt) {
    return '-'
  }

  const executedAt = parseDateMs(action.executedAt)
  const triggerReceivedAt = parseDateMs(action.triggerReceivedAt)

  if (executedAt === null || triggerReceivedAt === null) {
    return '-'
  }

  return formatDurationMs(Math.max(0, executedAt - triggerReceivedAt))
}

function formatRelativeSeconds(value: number | null) {
  if (value === null) {
    return '-'
  }

  if (value < 60) {
    return `${value.toFixed(3).replace(/\.?0+$/, '')}s`
  }

  const minutes = Math.floor(value / 60)
  const seconds = value % 60

  return `${minutes}m ${seconds.toFixed(1).padStart(4, '0')}s`
}

function transcriptEntryLabel(entry: TranscriptToolCallEntry) {
  if (entry.role === 'action_executed') {
    return entry.toolName || entry.toolType || 'Tool call'
  }

  if (entry.role === 'agent' || entry.role === 'user') {
    return ''
  }

  return entry.role || 'Entry'
}

function transcriptEntryRoleLabel(entry: TranscriptToolCallEntry) {
  if (entry.role === 'action_executed') {
    return 'Tool'
  }

  if (entry.role === 'agent') {
    return 'Agent'
  }

  if (entry.role === 'user') {
    return 'User'
  }

  return 'Event'
}

function transcriptEntryDetail(entry: TranscriptToolCallEntry) {
  if (entry.role === 'action_executed') {
    return entry.toolType ? `Tool type: ${entry.toolType}` : entry.toolCallId || ''
  }

  return entry.content || ''
}

function transcriptEntryClass(entry: TranscriptToolCallEntry) {
  if (entry.role === 'action_executed') {
    return 'is-tool-call'
  }

  if (entry.role === 'agent') {
    return 'is-agent'
  }

  if (entry.role === 'user') {
    return 'is-user'
  }

  return ''
}

function waterfallBarStyle(item: { startTime: number | null; endTime: number | null }) {
  const startTime = item.startTime ?? 0
  const endTime = item.endTime ?? startTime
  const range = transcriptWaterfallRange.value
  const left = Math.max(0, Math.min(100, (startTime / range) * 100))
  const width = Math.max(0.6, Math.min(100 - left, ((Math.max(endTime, startTime) - startTime) / range) * 100))

  return {
    left: `${left}%`,
    width: `${width}%`,
  }
}

onMounted(refreshAll)
</script>

<template>
  <NConfigProvider
    :theme-overrides="themeOverrides"
    :style-mount-target="shadowRoot"
    :preflight-style-disabled="true"
  >
    <section class="observability-board" aria-label="Voice AI observability">
      <div class="filter-bar">
        <NSpace class="filter-controls" :size="8" wrap>
          <NSelect
            class="agent-select"
            :value="selectedAgentId"
            :options="agentOptions"
            :loading="agentsLoading"
            :disabled="busy"
            :to="overlayTarget"
            filterable
            @update:value="handleAgentUpdate"
          />

          <NDatePicker
            class="date-picker"
            :value="dateRange"
            type="daterange"
            :disabled="busy"
            :to="overlayTarget"
            clearable
            @update:value="handleDateRangeUpdate"
          />
        </NSpace>

        <NButton :loading="busy" :disabled="busy" @click="refreshAll">
          Refresh
        </NButton>
      </div>

      <NAlert v-if="authError" type="error" :bordered="true">
        {{ authError }}
      </NAlert>

      <NAlert v-if="agentsError" type="warning" :bordered="true">
        {{ agentsError }}
      </NAlert>

      <NAlert v-if="callLogsError" type="error" :bordered="true">
        {{ callLogsError }}
      </NAlert>

      <template v-if="auth">
        <div class="metric-grid metric-grid-primary">
          <NCard class="metric-card metric-card-active" size="small" :bordered="true">
            <NStatistic label="Total Calls" :value="totalCalls" />
            <div class="metric-caption">{{ selectedAgentLabel }}</div>
          </NCard>

          <NCard class="metric-card" size="small" :bordered="true">
            <NStatistic label="Actions Triggered" :value="actionsTriggered" />
            <div class="metric-caption">Current page</div>
          </NCard>

          <NCard class="metric-card" size="small" :bordered="true">
            <NStatistic label="Transcript Coverage" :value="`${transcriptCoverage}%`" />
            <div class="metric-caption">{{ returnedCalls }} returned logs</div>
          </NCard>
        </div>

        <div class="metric-grid metric-grid-secondary">
          <NCard class="metric-card metric-card-compact" size="small" :bordered="true">
            <NStatistic label="Average Duration" :value="formatDuration(averageDuration)" />
          </NCard>

          <NCard class="metric-card metric-card-compact" size="small" :bordered="true">
            <NStatistic label="Trial Calls" :value="trialCalls" />
          </NCard>
        </div>

        <section class="table-section" aria-label="Call logs">
          <div class="table-toolbar">
            <div>
              <h3>Call Logs</h3>
              <span>{{ totalCalls }} total</span>
            </div>

            <NPagination
              :page="page"
              :page-count="totalPages"
              :disabled="logsLoading"
              :page-slot="5"
              @update:page="goToPage"
            />
          </div>

          <NDataTable
            :columns="callLogColumns"
            :data="visibleLogs"
            :loading="logsLoading"
            :pagination="false"
            :row-key="(row: CallLog) => row.id"
            :row-props="rowProps"
            :bordered="false"
            size="medium"
          >
            <template #empty>
              <NEmpty description="No call logs found" />
            </template>
          </NDataTable>
        </section>

        <NDrawer
          v-if="overlayTarget"
          v-model:show="detailVisible"
          :to="overlayTarget"
          :width="760"
          :block-scroll="false"
          placement="right"
        >
          <NDrawerContent closable>
            <template #header>
              <div class="drawer-title">
                <strong>Call Detail</strong>
                <span>{{ selectedCallLog?.id }}</span>
              </div>
            </template>

            <NSpin :show="detailLoading">
              <div v-if="selectedCallLog" class="detail-content">
                <NAlert v-if="detailError" type="warning" :bordered="true">
                  {{ detailError }}
                </NAlert>

                <NDescriptions :column="2" bordered size="small" label-placement="top">
                  <NDescriptionsItem label="Agent ID">
                    {{ selectedCallLog.agentId }}
                  </NDescriptionsItem>
                  <NDescriptionsItem label="Contact ID">
                    {{ selectedCallLog.contactId || '-' }}
                  </NDescriptionsItem>
                  <NDescriptionsItem v-for="signal in detailSignals" :key="signal.label" :label="signal.label">
                    {{ signal.value }}
                  </NDescriptionsItem>
                </NDescriptions>

                <section class="detail-section">
                  <h4>Summary</h4>
                  <p>{{ selectedCallLog.summary || 'No summary recorded.' }}</p>
                </section>

                <section class="detail-section">
                  <h4>Transcript and Tool Calls</h4>

                  <div v-if="transcriptWaterfall.length" class="tool-waterfall">
                    <div class="tool-waterfall-head">
                      <span class="tool-detail-heading">Details</span>
                      <div class="waterfall-scale">
                        <span>0s</span>
                        <span>{{ formatRelativeSeconds(transcriptWaterfallRange * 0.25) }}</span>
                        <span>{{ formatRelativeSeconds(transcriptWaterfallRange * 0.5) }}</span>
                        <span>{{ formatRelativeSeconds(transcriptWaterfallRange * 0.75) }}</span>
                        <span>{{ formatRelativeSeconds(transcriptWaterfallRange) }}</span>
                      </div>
                    </div>

                    <article
                      v-for="item in transcriptWaterfall"
                      :key="`${item.entry.role ?? 'entry'}-${item.index}`"
                      class="tool-waterfall-item"
                      :class="transcriptEntryClass(item.entry)"
                    >
                      <div class="tool-waterfall-row">
                        <div class="tool-entry">
                          <div class="tool-entry-heading">
                            <span class="tool-role-label">{{ transcriptEntryRoleLabel(item.entry) }}</span>
                            <strong v-if="transcriptEntryLabel(item.entry)">{{ transcriptEntryLabel(item.entry) }}</strong>
                          </div>
                          <p>{{ transcriptEntryDetail(item.entry) }}</p>

                          <NCollapse v-if="hasData(item.entry.toolArguments)" class="tool-params" arrow-placement="right">
                            <NCollapseItem title="Tool arguments" :name="String(item.index)">
                              <NCode :code="prettyJson(item.entry.toolArguments)" language="json" word-wrap />
                            </NCollapseItem>
                          </NCollapse>
                        </div>

                        <div class="tool-track">
                          <span class="tool-bar" :style="waterfallBarStyle(item)">
                            <b>{{ formatRelativeSeconds(item.duration) }}</b>
                          </span>
                        </div>
                      </div>
                    </article>
                  </div>

                  <NEmpty v-else description="No transcript or tool-call timeline recorded" />
                </section>

                <section class="detail-section">
                  <h4>Action Timeline</h4>

                  <div v-if="actionTimeline.length" class="action-waterfall">
                    <article v-for="item in actionTimeline" :key="item.action.actionId ?? item.timelineIndex" class="waterfall-item">
                      <div class="waterfall-rail">
                        <span class="waterfall-dot"></span>
                      </div>

                      <div class="waterfall-body">
                        <div class="waterfall-header">
                          <div>
                            <strong>{{ item.action.actionName || item.action.actionId || 'Action' }}</strong>
                            <span>{{ item.action.actionType || 'Unknown type' }}</span>
                          </div>

                          <NTag size="small" type="info" :bordered="false">
                            {{ formatActionLatency(item.action) }}
                          </NTag>
                        </div>

                        <div class="waterfall-meta">
                          <span>Triggered {{ formatDate(item.action.triggerReceivedAt) }}</span>
                          <span>Executed {{ formatDate(item.action.executedAt) }}</span>
                          <span v-if="item.gapFromPrevious !== null">Gap {{ formatDurationMs(item.gapFromPrevious) }}</span>
                        </div>

                        <NCollapse v-if="hasData(item.action.actionParameters)" class="waterfall-params" arrow-placement="right">
                          <NCollapseItem title="Parameters" :name="String(item.timelineIndex)">
                            <NCode :code="prettyJson(item.action.actionParameters)" language="json" word-wrap />
                          </NCollapseItem>
                        </NCollapse>
                      </div>
                    </article>
                  </div>

                  <NEmpty v-else description="No actions recorded" />
                </section>

                <section v-if="hasData(selectedCallLog.extractedData)" class="detail-section">
                  <h4>Extracted Data</h4>
                  <NCode :code="prettyJson(selectedCallLog.extractedData)" language="json" word-wrap />
                </section>

              </div>
            </NSpin>
          </NDrawerContent>
        </NDrawer>
      </template>

      <NEmpty v-else class="empty-state" :description="authenticating ? 'Loading observability data' : 'Authentication required'" />
    </section>

    <div ref="portalTarget" class="overlay-host"></div>
  </NConfigProvider>
</template>

<style>
:host {
  all: initial;
  display: block;
  color: #344054;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

* {
  box-sizing: border-box;
}

.observability-board {
  display: grid;
  gap: 12px;
  width: 100%;
  padding: 12px 0 0;
  color: #344054;
  font-size: 14px;
  line-height: 21px;
}

.overlay-host {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  pointer-events: none;
}

.overlay-host .n-drawer-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.overlay-host .n-drawer,
.overlay-host .n-drawer-mask {
  pointer-events: auto;
}

.overlay-host .v-binder-follower-content,
.overlay-host .v-binder-follower-content > * {
  pointer-events: auto;
}

h3,
h4,
p {
  margin: 0;
}

.filter-bar,
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.filter-bar {
  min-height: 40px;
}

.filter-controls {
  min-width: 0;
}

.agent-select {
  width: 220px;
}

.date-picker {
  width: 330px;
}

.metric-grid {
  display: grid;
  width: 100%;
}

.metric-grid-primary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 4px;
}

.metric-grid-secondary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0;
}

.metric-card {
  min-width: 0;
  min-height: 115px;
}

.metric-card-active {
  border-color: #84adff;
}

.metric-card-compact {
  min-height: 75px;
}

.metric-card :is(.n-card__content) {
  display: grid;
  align-content: center;
  gap: 6px;
  min-height: inherit;
  padding: 8px 24px;
}

.metric-card :is(.n-statistic .n-statistic__label) {
  color: #344054;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}

.metric-card :is(.n-statistic .n-statistic-value) {
  color: #101828;
  font-size: 30px;
  font-weight: 700;
  line-height: 36px;
}

.metric-caption {
  min-width: 0;
  overflow: hidden;
  color: #667085;
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-section {
  display: grid;
  gap: 0;
  width: 100%;
}

.table-toolbar {
  min-height: 56px;
  padding-bottom: 16px;
}

.table-toolbar h3 {
  color: #101828;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.table-toolbar span {
  display: block;
  color: #667085;
  font-size: 13px;
  line-height: 20px;
}

.cell-main,
.cell-sub {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-main {
  color: #344054;
  font-weight: 500;
}

.cell-sub {
  margin-top: 2px;
  color: #667085;
  font-size: 12px;
  line-height: 18px;
}

.n-data-table-tr {
  cursor: pointer;
}

.n-data-table-tr.selected-row .n-data-table-td {
  background: #eff4ff;
}

.drawer-title {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.drawer-title strong {
  color: #101828;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.drawer-title span {
  overflow: hidden;
  color: #667085;
  font-size: 13px;
  font-weight: 400;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-content {
  display: grid;
  gap: 18px;
  padding: 18px 24px 24px;
}

.detail-section {
  display: grid;
  gap: 10px;
}

.detail-section h4 {
  color: #101828;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.detail-section p {
  color: #344054;
  font-size: 14px;
  line-height: 22px;
}

.tool-waterfall {
  display: grid;
  max-height: 420px;
  overflow: auto;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #ffffff;
}

.tool-waterfall-head,
.tool-waterfall-row {
  display: grid;
  grid-template-columns: 260px minmax(420px, 1fr);
  min-width: 720px;
}

.tool-waterfall-head {
  position: sticky;
  top: 0;
  z-index: 2;
  align-items: center;
  border-bottom: 1px solid #eaecf0;
  background: #f9fafb;
  color: #667085;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.tool-detail-heading {
  position: sticky;
  left: 0;
  z-index: 3;
  height: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-right: 1px solid #eaecf0;
  background: #f9fafb;
  color: #667085;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
}

.tool-entry,
.tool-track {
  min-width: 0;
  padding: 10px 12px;
}

.waterfall-scale {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  height: 100%;
  min-height: 38px;
  align-items: center;
  background: #f9fafb;
  box-shadow: inset 1px 0 0 #eaecf0;
  color: #667085;
}

.waterfall-scale span {
  position: relative;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.waterfall-scale span:not(:first-child)::before {
  position: absolute;
  top: -12px;
  bottom: -12px;
  left: 0;
  width: 1px;
  background: #eaecf0;
  content: "";
}

.tool-waterfall-item + .tool-waterfall-item {
  border-top: 1px solid #f2f4f7;
}

.tool-waterfall-row {
  align-items: stretch;
}

.tool-entry {
  position: sticky;
  left: 0;
  z-index: 1;
  display: grid;
  gap: 3px;
  align-content: start;
  border-right: 1px solid #eaecf0;
  background: #ffffff;
}

.tool-entry-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.tool-role-label {
  flex: 0 0 auto;
  color: #175cd3;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.tool-waterfall-item.is-user .tool-role-label {
  color: #067647;
}

.tool-waterfall-item.is-tool-call .tool-role-label {
  color: #b54708;
}

.tool-entry strong {
  min-width: 0;
  overflow: hidden;
  color: #101828;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-entry p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: #667085;
  font-size: 12px;
  line-height: 18px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.tool-track {
  position: relative;
  min-height: 40px;
  background:
    linear-gradient(to right, #eaecf0 1px, transparent 1px) 0 0 / 25% 100%,
    #fcfcfd;
}

.tool-bar {
  position: absolute;
  top: 11px;
  height: 18px;
  min-width: 3px;
  border-radius: 3px;
  background: #84adff;
}

.tool-bar b {
  position: absolute;
  left: calc(100% + 6px);
  color: #667085;
  font-size: 11px;
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
}

.tool-waterfall-item.is-user .tool-bar {
  background: #12b76a;
}

.tool-waterfall-item.is-tool-call .tool-bar {
  background: #f79009;
}

.tool-params {
  min-width: 0;
  margin-top: 6px;
  font-size: 12px;
}

.tool-params :is(.n-collapse-item__header) {
  padding: 0;
}

.tool-params :is(.n-collapse-item__content-inner) {
  padding-top: 6px;
}

.action-waterfall {
  display: grid;
  gap: 0;
}

.waterfall-item {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  min-width: 0;
}

.waterfall-rail {
  position: relative;
  display: flex;
  justify-content: center;
}

.waterfall-rail::before {
  position: absolute;
  top: 18px;
  bottom: -18px;
  width: 1px;
  background: #d0d5dd;
  content: "";
}

.waterfall-item:last-child .waterfall-rail::before {
  display: none;
}

.waterfall-dot {
  position: relative;
  z-index: 1;
  width: 10px;
  height: 10px;
  margin-top: 12px;
  border: 2px solid #84adff;
  border-radius: 999px;
  background: #ffffff;
}

.waterfall-body {
  min-width: 0;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #ffffff;
}

.waterfall-header,
.waterfall-meta {
  display: flex;
  align-items: center;
}

.waterfall-header {
  justify-content: space-between;
  gap: 12px;
}

.waterfall-header > div {
  min-width: 0;
}

.waterfall-header strong,
.waterfall-header span {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.waterfall-header strong {
  color: #101828;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.waterfall-header span,
.waterfall-meta {
  color: #667085;
  font-size: 12px;
  line-height: 18px;
}

.waterfall-meta {
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 8px;
}

.waterfall-params {
  margin-top: 10px;
}

.detail-section pre {
  max-height: 340px;
  margin: 0;
  overflow: auto;
  padding: 12px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #f9fafb;
  color: #344054;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
}

.empty-state {
  min-height: 180px;
}

@media (max-width: 980px) {
  .filter-bar,
  .table-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .metric-grid-primary,
  .metric-grid-secondary {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .agent-select,
  .date-picker {
    width: 100%;
  }

  .filter-controls,
  .filter-bar > .n-button {
    width: 100%;
  }
}
</style>
