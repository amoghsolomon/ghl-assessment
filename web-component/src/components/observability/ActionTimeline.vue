<script setup lang="ts">
import { computed } from 'vue'
import { NCode, NCollapse, NCollapseItem, NEmpty, NTag } from 'naive-ui'
import type { CallLog, ExecutedCallAction } from '../../types'
import { formatDate, formatDurationMs } from '../../lib/format'
import { hasData, parseDateMs, prettyJson } from '../../lib/data'

const props = defineProps<{
  callLog: CallLog
}>()

const actionTimeline = computed(() => {
  return [...(props.callLog.executedCallActions ?? [])]
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
</script>

<template>
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
</template>
