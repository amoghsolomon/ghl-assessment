import type { CallAnalysis, CallLog, ToolFinding } from '../types'

export function safeDuration(seconds: number) {
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0
}

export function formatDuration(seconds: number) {
  const totalSeconds = safeDuration(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }

  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`
}

export function formatDate(value?: string) {
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

export function formatRelativeSeconds(value: number | null) {
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

export function formatDurationMs(milliseconds: number | null) {
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

export function formatOutcome(value?: CallAnalysis['outcome']) {
  return value ? titleCase(value.replaceAll('_', ' ')) : '-'
}

export function formatSentiment(value?: CallAnalysis['sentiment']) {
  return value ? titleCase(value) : '-'
}

export function formatFailureReason(value?: string | null) {
  return value ? titleCase(value.replaceAll('_', ' ')) : '-'
}

export function formatToolCorrectness(value: ToolFinding['correctness']) {
  return titleCase(value)
}

export function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function healthLabel(analysis?: CallAnalysis) {
  if (!analysis || analysis.status !== 'completed') {
    return 'Needs attention'
  }

  if (analysis.rating === 3) {
    return 'Critical'
  }

  if (analysis.rating === 2) {
    return 'Needs attention'
  }

  return 'Healthy'
}

export function healthClass(analysis?: CallAnalysis) {
  if (!analysis || analysis.status !== 'completed') {
    return 'is-muted'
  }

  if (analysis.rating === 3) {
    return 'is-critical'
  }

  if (analysis.rating === 2) {
    return 'is-warning'
  }

  return 'is-healthy'
}

export function getPrimaryFinding(callLog: CallLog) {
  const analysis = callLog.review

  if (!analysis || analysis.status !== 'completed') {
    return {
      title: callLog.summary || callLog.transcriptPreview || 'Analysis pending',
      detail: 'Open the call to retry or inspect the available transcript.',
    }
  }

  return {
    title: analysis.topFinding || analysis.agentFindings?.[0]?.title || analysis.recommendations?.[0]?.title || 'No major issues found',
    detail: analysis.ratingReason || analysis.agentFindings?.[0]?.detail || analysis.recommendations?.[0]?.reason || '',
  }
}
