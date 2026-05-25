<script setup lang="ts">
import { NCard, NStatistic, NTooltip } from 'naive-ui'
import type { CopilotSummary } from '../../types'

defineProps<{
  summary?: CopilotSummary
  totalCalls: number
}>()

function formatPercent(value?: number | null) {
  return typeof value === 'number' ? `${value}%` : '-'
}

const kpiCards = [
  {
    key: 'successRate',
    label: 'Success Rate',
    description: 'Completed analyses where outcome is success divided by all completed analyses.',
    caption: (summary?: CopilotSummary, totalCalls = 0) =>
      `${summary?.dashboardKpis.analyzedCalls ?? 0} analyzed · ${totalCalls} total`,
  },
  {
    key: 'completionQuality',
    label: 'Completion Quality',
    description: 'Success counts as 1 point, partial success counts as 0.5 points, divided by completed analyses.',
    caption: () => 'Success counts fully, partial counts halfway',
  },
  {
    key: 'healthyCallRate',
    label: 'Healthy Calls',
    description: 'Completed analyses with health rating 1 of 3 divided by all completed analyses.',
    caption: () => 'Rating 1 of 3 from call analysis',
  },
  {
    key: 'positiveSentimentRate',
    label: 'Positive Sentiment',
    description: 'Completed analyses where user sentiment is positive divided by all completed analyses.',
    caption: () => 'Positive user sentiment',
  },
  {
    key: 'toolAccuracyRate',
    label: 'Tool Accuracy',
    description:
      'Observed tool calls minus calls flagged incorrect or questionable, divided by observed tool calls.',
    caption: () => 'Correct or unflagged tool calls',
  },
] as const
</script>

<template>
  <div class="metric-grid metric-grid-primary">
    <NCard
      v-for="(card, index) in kpiCards"
      :key="card.key"
      class="metric-card"
      :class="{ 'metric-card-active': index === 0 }"
      size="small"
      :bordered="true"
    >
      <NTooltip trigger="hover" placement="top">
        <template #trigger>
          <button class="metric-info-button" type="button" aria-label="How this KPI is calculated">?</button>
        </template>
        {{ card.description }}
      </NTooltip>

      <NStatistic :label="card.label" :value="formatPercent(summary?.dashboardKpis[card.key])" />
      <div class="metric-caption">{{ card.caption(summary, totalCalls) }}</div>
    </NCard>
  </div>
</template>
