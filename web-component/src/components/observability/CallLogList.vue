<script setup lang="ts">
import { NEmpty, NPagination, NSpin } from 'naive-ui'
import type { CallLog } from '../../types'
import { formatDate, formatDuration, formatOutcome, formatSentiment, getPrimaryFinding, healthClass, healthLabel } from '../../lib/format'
import HealthDot from './HealthDot.vue'

defineProps<{
  logs: CallLog[]
  loading: boolean
  totalCalls: number
  page: number
  totalPages: number
  selectedCallId?: string
}>()

defineEmits<{
  select: [callLog: CallLog]
  page: [page: number]
}>()
</script>

<template>
  <section class="table-section" aria-label="Call logs">
    <div class="table-toolbar">
      <div>
        <h3>Call Logs</h3>
        <span>{{ totalCalls }} total</span>
      </div>

      <NPagination
        :page="page"
        :page-count="totalPages"
        :disabled="loading"
        :page-slot="5"
        @update:page="$emit('page', $event)"
      />
    </div>

    <NSpin :show="loading">
      <div v-if="logs.length" class="call-log-list">
        <article
          v-for="callLog in logs"
          :key="callLog.id"
          class="call-log-row"
          :class="{ 'is-selected': selectedCallId === callLog.id }"
          tabindex="0"
          @click="$emit('select', callLog)"
          @keydown.enter="$emit('select', callLog)"
        >
          <div class="call-log-main">
            <HealthDot :label="healthLabel(callLog.review)" :tone="healthClass(callLog.review)" />
            <div class="call-log-time">
              <strong>{{ formatDate(callLog.createdAt) }}</strong>
              <span>{{ formatDuration(callLog.duration) }}</span>
            </div>
          </div>

          <div class="call-log-review">
            <div>
              <span>Outcome</span>
              <strong>{{ formatOutcome(callLog.review?.outcome) }}</strong>
            </div>
            <div>
              <span>Sentiment</span>
              <strong>{{ formatSentiment(callLog.review?.sentiment) }}</strong>
            </div>
          </div>

          <div class="call-log-finding">
            <strong>{{ getPrimaryFinding(callLog).title }}</strong>
            <p>{{ getPrimaryFinding(callLog).detail }}</p>
            <div v-if="callLog.review?.recommendations?.length" class="inline-recommendations">
              <span v-for="recommendation in callLog.review.recommendations.slice(0, 2)" :key="`${recommendation.target}-${recommendation.title}`">
                {{ recommendation.target }}: {{ recommendation.title }}
              </span>
            </div>
          </div>
        </article>
      </div>

      <NEmpty v-else description="No call logs found" />
    </NSpin>
  </section>
</template>
