<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useShadowRoot, watch } from 'vue'
import { NAlert, NConfigProvider, NDatePicker, NEmpty, NSelect, NSpace, type SelectOption } from 'naive-ui'
import { themeOverrides } from './theme'
import type { AgentsResponse, AuthResponse, CallLog, CallLogDetailResponse, CallLogsResponse } from './types'
import InsightMetrics from './components/observability/InsightMetrics.vue'
import CallLogList from './components/observability/CallLogList.vue'
import CallDetailDrawer from './components/observability/CallDetailDrawer.vue'

declare global {
  interface Window {
    exposeSessionDetails?: (appId: string) => Promise<string>
  }
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
const analysisRetrying = ref(false)
const authError = ref('')
const agentsError = ref('')
const callLogsError = ref('')
const detailError = ref('')
const analysisRefreshTimer = ref<number | null>(null)

const baseUrl = computed(() => props.apiBaseUrl.replace(/\/$/, ''))
const visibleLogs = computed(() => callLogs.value?.callLogs ?? [])
const copilotSummary = computed(() => callLogs.value?.copilotSummary)
const totalCalls = computed(() => callLogs.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(totalCalls.value / pageSize)))
const busy = computed(() => authenticating.value || agentsLoading.value || logsLoading.value)
const pendingAnalysisCount = computed(() =>
  visibleLogs.value.filter((callLog) => callLog.review?.status === 'queued' || callLog.review?.status === 'processing').length
)
const selectedAgentName = computed(() => getAgentName(selectedCallLog.value?.agentId ?? selectedAgentId.value))
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
      options.push({ label: getAgentName(callLog.agentId), value: callLog.agentId })
    }
  }

  return options
})

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
    const params = new URLSearchParams({ page: '1', pageSize: '50' })
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
    scheduleAnalysisRefresh()
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

    selectedCallLog.value = mergeCallLogDetail(callLog, payload.callLog)
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : 'Unable to load call log details'
  } finally {
    detailLoading.value = false
  }
}

async function retrySelectedAnalysis() {
  if (!auth.value || !selectedCallLog.value) {
    return
  }

  const currentCallLog = selectedCallLog.value
  analysisRetrying.value = true
  detailError.value = ''

  try {
    const response = await fetch(
      `${baseUrl.value}/api/voice-ai/call-logs/${encodeURIComponent(currentCallLog.id)}/review/retry`,
      {
        method: 'POST',
        headers: authHeaders(),
      }
    )

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(payload?.error ?? `Analysis retry failed with ${response.status}`)
    }

    const payload = (await response.json()) as CallLogDetailResponse

    selectedCallLog.value = mergeCallLogDetail(currentCallLog, payload.callLog)
    await loadCallLogs()
  } catch (err) {
    detailError.value = err instanceof Error ? err.message : 'Unable to retry analysis'
  } finally {
    analysisRetrying.value = false
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
  clearAnalysisRefresh()
  await loadCallLogs()
}

async function handleDateRangeUpdate(value: number | [number, number] | null) {
  dateRange.value = Array.isArray(value) ? value : null
  page.value = 1
  selectedCallLog.value = null
  clearAnalysisRefresh()
  await loadCallLogs()
}

async function goToPage(nextPage: number) {
  page.value = Math.min(Math.max(nextPage, 1), totalPages.value)
  clearAnalysisRefresh()
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

function syncSelectedLog() {
  if (!selectedCallLog.value) {
    return
  }

  const updatedLog = visibleLogs.value.find((callLog) => callLog.id === selectedCallLog.value?.id)

  selectedCallLog.value = updatedLog ? mergeCallLogDetail(selectedCallLog.value, updatedLog) : null
}

function mergeCallLogDetail(base: CallLog, detail: CallLog) {
  return {
    ...base,
    ...detail,
    transcriptWithToolCalls: detail.transcriptWithToolCalls?.length
      ? detail.transcriptWithToolCalls
      : base.transcriptWithToolCalls ?? [],
  }
}

function scheduleAnalysisRefresh() {
  clearAnalysisRefresh()

  if (!pendingAnalysisCount.value) {
    return
  }

  analysisRefreshTimer.value = window.setTimeout(() => {
    analysisRefreshTimer.value = null
    void loadCallLogs()
  }, 5000)
}

function clearAnalysisRefresh() {
  if (analysisRefreshTimer.value !== null) {
    window.clearTimeout(analysisRefreshTimer.value)
    analysisRefreshTimer.value = null
  }
}

function getAgentName(agentId?: string) {
  if (!agentId) {
    return '-'
  }

  return agents.value?.agents.find((agent) => agent.id === agentId)?.name ?? agentId
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

onMounted(refreshAll)
onBeforeUnmount(clearAnalysisRefresh)
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

        <!-- <NButton :loading="busy" :disabled="busy" @click="refreshAll">
          Refresh
        </NButton> -->
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
        <InsightMetrics :summary="copilotSummary" :total-calls="totalCalls" />

        <CallLogList
          :logs="visibleLogs"
          :loading="logsLoading"
          :total-calls="totalCalls"
          :page="page"
          :total-pages="totalPages"
          :selected-call-id="selectedCallLog?.id"
          @select="loadCallLogDetail"
          @page="goToPage"
        />

        <CallDetailDrawer
          v-model:show="detailVisible"
          :call-log="selectedCallLog"
          :loading="detailLoading"
          :error="detailError"
          :retrying="analysisRetrying"
          :overlay-target="overlayTarget"
          :agent-name="selectedAgentName"
          @retry="retrySelectedAnalysis"
        />
      </template>

      <NEmpty v-else class="empty-state" :description="authenticating ? 'Loading observability data' : 'Authentication required'" />
    </section>

    <div ref="portalTarget" class="overlay-host"></div>
  </NConfigProvider>
</template>

<style src="./observability.css"></style>
