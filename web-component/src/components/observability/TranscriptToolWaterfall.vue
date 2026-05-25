<script setup lang="ts">
import { computed } from 'vue'
import { NCode, NCollapse, NCollapseItem, NEmpty } from 'naive-ui'
import type { CallLog, ToolFinding, TranscriptToolCallEntry } from '../../types'
import { formatRelativeSeconds, formatToolCorrectness } from '../../lib/format'
import { hasData, parseRelativeSeconds, prettyJson } from '../../lib/data'

const props = defineProps<{
  callLog: CallLog
}>()

const transcriptWaterfall = computed(() => {
  return [...(props.callLog.transcriptWithToolCalls ?? [])]
    .map((entry, index) => {
      const startTime = parseRelativeSeconds(entry.startTime)
      const endTime = parseRelativeSeconds(entry.endTime)

      return {
        entry,
        index,
        startTime,
        endTime,
        duration: startTime === null || endTime === null ? null : Math.max(0, endTime - startTime),
        finding: getToolFinding(entry, index),
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

  return Math.max(1, maxEntryTime, props.callLog.duration ?? 0)
})

function getToolFinding(entry: TranscriptToolCallEntry, index: number) {
  if (entry.role !== 'action_executed') {
    return undefined
  }

  const findings = props.callLog.review?.toolFindings ?? []

  return (
    findings.find((finding) => finding.toolCallId && finding.toolCallId === entry.toolCallId) ??
    findings.find((finding) => finding.timelineIndex === index) ??
    findings.find((finding) => finding.toolName && finding.toolName === entry.toolName)
  )
}

function transcriptEntryLabel(entry: TranscriptToolCallEntry) {
  if (entry.role === 'action_executed') {
    return entry.toolName || entry.toolType || 'Tool call'
  }

  return entry.role === 'agent' || entry.role === 'user' ? '' : entry.role || 'Entry'
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

function toolFindingClass(finding?: ToolFinding) {
  if (!finding) {
    return ''
  }

  if (finding.correctness === 'incorrect') {
    return 'is-critical'
  }

  if (finding.correctness === 'questionable') {
    return 'is-warning'
  }

  if (finding.correctness === 'correct') {
    return 'is-healthy'
  }

  return 'is-muted'
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
</script>

<template>
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

            <div v-if="item.finding" class="tool-finding" :class="toolFindingClass(item.finding)">
              <span>{{ formatToolCorrectness(item.finding.correctness) }}</span>
              <p>{{ item.finding.reason }}</p>
            </div>

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
</template>
