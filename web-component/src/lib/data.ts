export function countDataFields(value: unknown): number {
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

export function hasData(value: unknown) {
  return countDataFields(value) > 0
}

export function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export function parseRelativeSeconds(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return Math.max(0, value)
}

export function parseDateMs(value?: string) {
  if (!value) {
    return null
  }

  const parsed = new Date(value).getTime()

  return Number.isFinite(parsed) ? parsed : null
}
