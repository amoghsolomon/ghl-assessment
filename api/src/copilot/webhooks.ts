import { createPublicKey, createVerify, verify } from 'node:crypto'
import type { AppConfig } from '../config.js'
import type { StoredCallLog } from './types.js'

export type VoiceAiCallEndWebhook = StoredCallLog & {
  eventId?: string
  webhookId?: string
  type?: string
  eventType?: string
  locationId: string
  companyId?: string
  appId?: string
}

export function parseWebhookPayload(rawBody: string) {
  const payload = JSON.parse(rawBody) as VoiceAiCallEndWebhook

  if (!payload.locationId) {
    throw new Error('Webhook payload is missing locationId')
  }

  if (!payload.id) {
    throw new Error('Webhook payload is missing call id')
  }

  return payload
}

export function isVoiceAiCallEnd(payload: VoiceAiCallEndWebhook) {
  const eventType = payload.type ?? payload.eventType

  return eventType === 'VoiceAiCallEnd' || eventType === 'VOICE_AI_CALL_END'
}

export function getWebhookEventId(payload: VoiceAiCallEndWebhook) {
  if (payload.eventId || payload.webhookId) {
    return payload.eventId ?? payload.webhookId!
  }

  const eventType = payload.type ?? payload.eventType ?? 'VoiceAiCallEnd'

  return `${eventType}:${payload.locationId}:${payload.id}`
}

export function verifyWebhookSignature(rawBody: string, headers: Headers, config: AppConfig) {
  const ghlSignature = headers.get('x-ghl-signature')
  const whSignature = headers.get('x-wh-signature')

  if (ghlSignature && config.webhookSignaturePublicKey) {
    return verifyEd25519Signature(rawBody, ghlSignature, config.webhookSignaturePublicKey)
  }

  if (whSignature && config.webhookPublicKey) {
    return verifySha256Signature(rawBody, whSignature, config.webhookPublicKey)
  }

  return !(config.webhookSignaturePublicKey || config.webhookPublicKey)
}

function verifyEd25519Signature(payload: string, signature: string, publicKey: string) {
  const key = createPublicKey(publicKey)

  return verify(null, Buffer.from(payload, 'utf8'), key, Buffer.from(signature, 'base64'))
}

function verifySha256Signature(payload: string, signature: string, publicKey: string) {
  const verifier = createVerify('sha256')

  verifier.update(payload)
  verifier.end()

  return verifier.verify(publicKey, signature, 'base64')
}
