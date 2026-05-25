import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
  type BinaryLike,
} from 'node:crypto'

export type HighLevelUserContext = {
  userId: string
  companyId: string
  role?: string
  type?: string
  activeLocation?: string
  userName?: string
  email?: string
  isAgencyOwner?: boolean
  versionId?: string
  appStatus?: string
  [key: string]: unknown
}

export type AppSession = {
  userId: string
  companyId: string
  locationId: string
  role?: string
  type?: string
  email?: string
  iat: number
  exp: number
}

type TokenHeader = {
  alg: 'HS256'
  typ: 'JWT'
}

const openSslSaltPrefix = Buffer.from('Salted__', 'utf8')

export function decryptHighLevelUserContext(encryptedData: string, sharedSecret: string) {
  if (!encryptedData) {
    throw new Error('Missing encrypted user context')
  }

  if (!sharedSecret) {
    throw new Error('Missing GHL_APP_SHARED_SECRET')
  }

  const encrypted = Buffer.from(encryptedData, 'base64')

  if (encrypted.length <= 16 || !encrypted.subarray(0, 8).equals(openSslSaltPrefix)) {
    throw new Error('Unsupported encrypted user context format')
  }

  const salt = encrypted.subarray(8, 16)
  const ciphertext = encrypted.subarray(16)
  const { key, iv } = deriveOpenSslKeyAndIv(sharedSecret, salt)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')

  return JSON.parse(decrypted) as HighLevelUserContext
}

export function createAppSessionToken(
  context: HighLevelUserContext,
  locationId: string,
  secret: string,
  ttlSeconds = 15 * 60
) {
  if (!secret) {
    throw new Error('Missing APP_SESSION_SECRET')
  }

  const now = Math.floor(Date.now() / 1000)
  const payload: AppSession = {
    userId: context.userId,
    companyId: context.companyId,
    locationId,
    role: context.role,
    type: context.type,
    email: context.email,
    iat: now,
    exp: now + ttlSeconds,
  }

  return signToken({ alg: 'HS256', typ: 'JWT' }, payload, secret)
}

export function verifyAppSessionToken(token: string, secret: string) {
  if (!secret) {
    throw new Error('Missing APP_SESSION_SECRET')
  }

  const [encodedHeader, encodedPayload, signature] = token.split('.')

  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error('Invalid app session token')
  }

  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, secret)
  const signatureBuffer = Buffer.from(signature)
  const expectedSignatureBuffer = Buffer.from(expectedSignature)

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    throw new Error('Invalid app session signature')
  }

  const header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8')) as TokenHeader

  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new Error('Unsupported app session token')
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8')) as AppSession

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('App session expired')
  }

  return payload
}

function signToken(header: TokenHeader, payload: AppSession, secret: string) {
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const body = `${encodedHeader}.${encodedPayload}`

  return `${body}.${sign(body, secret)}`
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function deriveOpenSslKeyAndIv(passphrase: string, salt: Buffer) {
  const passphraseBuffer = Buffer.from(passphrase, 'utf8')
  const derived = []
  let previous = Buffer.alloc(0)

  while (Buffer.concat(derived).length < 48) {
    previous = md5(Buffer.concat([previous, passphraseBuffer, salt]))
    derived.push(previous)
  }

  const keyAndIv = Buffer.concat(derived)

  return {
    key: keyAndIv.subarray(0, 32),
    iv: keyAndIv.subarray(32, 48),
  }
}

function md5(value: BinaryLike) {
  return createHash('md5').update(value).digest()
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url')
}

// Used only by local tests and fixtures.
export function encryptHighLevelUserContextFixture(payload: HighLevelUserContext, sharedSecret: string) {
  const salt = createHash('sha256').update(JSON.stringify(payload)).digest().subarray(0, 8)
  const { key, iv } = deriveOpenSslKeyAndIv(sharedSecret, salt)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ])

  return Buffer.concat([openSslSaltPrefix, salt, ciphertext]).toString('base64')
}
