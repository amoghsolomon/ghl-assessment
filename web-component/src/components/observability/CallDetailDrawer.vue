<script setup lang="ts">
import { computed } from 'vue'
import { NAlert, NButton, NCode, NDrawer, NDrawerContent, NEmpty, NSpin } from 'naive-ui'
import type { CallLog } from '../../types'
import {
  formatDate,
  formatDuration,
  formatFailureReason,
  formatOutcome,
  formatSentiment,
  getPrimaryFinding,
  healthClass,
  healthLabel,
} from '../../lib/format'
import { hasData, prettyJson } from '../../lib/data'
import HealthDot from './HealthDot.vue'
import TranscriptToolWaterfall from './TranscriptToolWaterfall.vue'
import ActionTimeline from './ActionTimeline.vue'

const props = defineProps<{
  show: boolean
  callLog: CallLog | null
  loading: boolean
  error: string
  retrying: boolean
  overlayTarget?: HTMLElement
  agentName: string
}>()

defineEmits<{
  'update:show': [show: boolean]
  retry: []
}>()

const analysis = computed(() => props.callLog?.review)
const primaryFinding = computed(() => (props.callLog ? getPrimaryFinding(props.callLog) : null))
</script>

<template>
  <NDrawer
    v-if="overlayTarget"
    :show="show"
    :to="overlayTarget"
    :width="820"
    :block-scroll="false"
    placement="right"
    @update:show="$emit('update:show', $event)"
  >
    <NDrawerContent closable>
      <template #header>
        <div class="drawer-title">
          <strong>Call Insights</strong>
          <span v-if="callLog">{{ formatDate(callLog.createdAt) }} · {{ formatDuration(callLog.duration) }} · {{ agentName }}</span>
        </div>
      </template>

      <NSpin :show="loading">
        <div v-if="callLog" class="detail-content">
          <NAlert v-if="error" type="warning" :bordered="true">
            {{ error }}
          </NAlert>

          <section class="detail-section insight-panel">
            <div class="insight-panel-header">
              <HealthDot :label="healthLabel(analysis)" :tone="healthClass(analysis)" />
              <div>
                <strong>{{ primaryFinding?.title }}</strong>
                <p>{{ primaryFinding?.detail }}</p>
              </div>
            </div>

            <div class="insight-facts">
              <div>
                <span>Outcome</span>
                <strong>{{ formatOutcome(analysis?.outcome) }}</strong>
              </div>
              <div>
                <span>Sentiment</span>
                <strong>{{ formatSentiment(analysis?.sentiment) }}</strong>
              </div>
              <div>
                <span>Failure reason</span>
                <strong>{{ formatFailureReason(analysis?.failureReason) }}</strong>
              </div>
            </div>

            <NAlert v-if="analysis?.status === 'queued' || analysis?.status === 'processing'" type="info" :bordered="true">
              Analysis is still being generated.
            </NAlert>

            <NAlert v-else-if="analysis?.status === 'failed'" type="error" :bordered="true">
              <div class="review-error">
                <span>{{ analysis.errorMessage || 'Analysis failed. Check OpenRouter configuration and retry.' }}</span>
                <NButton size="small" :loading="retrying" @click="$emit('retry')">
                  Retry
                </NButton>
              </div>
            </NAlert>

            <NEmpty v-else-if="!analysis" description="Analysis has not started yet" />
          </section>

          <section v-if="analysis?.status === 'completed' && analysis.recommendations?.length" class="detail-section">
            <h4>Findings and Recommendations</h4>
            <div class="recommendation-list is-detail">
              <article v-for="recommendation in analysis.recommendations" :key="`${recommendation.target}-${recommendation.title}`" class="recommendation-item">
                <span>{{ recommendation.target }}</span>
                <strong>{{ recommendation.title }}</strong>
                <p>{{ recommendation.suggestedChange }}</p>
              </article>
            </div>
          </section>

          <section class="detail-section">
            <h4>Summary</h4>
            <p>{{ callLog.summary || 'No summary recorded.' }}</p>
          </section>

          <TranscriptToolWaterfall :call-log="callLog" />
          <ActionTimeline :call-log="callLog" />

          <section v-if="hasData(callLog.extractedData)" class="detail-section">
            <h4>Extracted Data</h4>
            <NCode :code="prettyJson(callLog.extractedData)" language="json" word-wrap />
          </section>
        </div>
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>
