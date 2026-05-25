import { HighLevel, LogLevel, UserType, type ISessionData } from '@gohighlevel/api-client'
import { getAppConfig, requireOAuthConfig } from '../config.js'
import { SQLiteSessionStorage } from './sqlite-session-storage.js'

const GHL_INSTALL_URL =
  'https://marketplace.gohighlevel.com/v2/oauth/chooselocation?response_type=code&client_id=6a132795cd94029bfaecbe34-mpl5nj8m&scope=voice-ai-dashboard.readonly+voice-ai-agents.readonly+voice-ai-agents.write+voice-ai-agent-goals.readonly+voice-ai-agent-goals.write&version_id=6a132795cd94029bfaecbe34'

export const appConfig = getAppConfig()
const config = appConfig
requireOAuthConfig(config)

export const ghlSessionStorage = new SQLiteSessionStorage(config.sessionDbPath)

export const ghl = new HighLevel({
  clientId: config.ghlClientId,
  clientSecret: config.ghlClientSecret,
  sessionStorage: ghlSessionStorage,
  logLevel: LogLevel.WARN,
})

export function getRedirectUri(origin: string) {
  return `${getAppOrigin(origin)}/oauth/callback`
}

export function getAuthorizationUrl(origin: string) {
  const authorizationUrl = new URL(GHL_INSTALL_URL)

  authorizationUrl.searchParams.set('redirect_uri', getRedirectUri(origin))

  return authorizationUrl.toString()
}

export async function persistOAuthSession(sessionData: ISessionData) {
  const resourceId = getResourceId(sessionData)

  if (!resourceId) {
    throw new Error('HighLevel OAuth response did not include a companyId or locationId')
  }

  await ghlSessionStorage.setSession(resourceId, sessionData)
  return resourceId
}

export async function ensureLocationOAuthSession(locationId: string, companyId?: string) {
  const existingLocationSession = await ghlSessionStorage.getSession(locationId)

  if (existingLocationSession && !shouldRefreshStoredToken(existingLocationSession)) {
    return existingLocationSession
  }

  if (!companyId) {
    return null
  }

  const companySession = await ghlSessionStorage.getSession(companyId)

  if (!companySession) {
    return null
  }

  const locationToken = await ghl.oauth.getLocationAccessToken({
    companyId,
    locationId,
  })

  const locationSession: ISessionData = {
    ...existingLocationSession,
    ...locationToken,
    userType: UserType.Location,
    companyId,
    locationId,
    scope: locationToken.scope ?? existingLocationSession?.scope ?? companySession.scope,
    token_type: locationToken.token_type ?? existingLocationSession?.token_type ?? companySession.token_type,
    userId: locationToken.userId ?? existingLocationSession?.userId ?? companySession.userId,
  }

  await persistOAuthSession(locationSession)

  return locationSession
}

export async function exchangeAuthorizationCode(code: string, origin: string) {
  const tokenResponse = await ghl.oauth.getAccessToken({
    client_id: config.ghlClientId,
    client_secret: config.ghlClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(origin),
  })

  const resourceId = await persistOAuthSession(tokenResponse)
  const installedLocationIds: string[] = []

  if (tokenResponse.userType === UserType.Company && tokenResponse.companyId) {
    const approvedLocations = tokenResponse.approvedLocations ?? []

    for (const locationId of approvedLocations) {
      const locationToken = await ghl.oauth.getLocationAccessToken({
        companyId: tokenResponse.companyId,
        locationId,
      })

      await persistOAuthSession({
        ...locationToken,
        userType: UserType.Location,
        companyId: tokenResponse.companyId,
        locationId,
      })
      installedLocationIds.push(locationId)
    }
  }

  return {
    resourceId,
    userType: tokenResponse.userType,
    companyId: tokenResponse.companyId,
    locationId: tokenResponse.locationId,
    installedLocationIds,
  }
}

function getResourceId(sessionData: ISessionData) {
  if (sessionData.userType === UserType.Company) {
    return sessionData.companyId
  }

  return sessionData.locationId ?? sessionData.companyId
}

function getAppOrigin(origin: string) {
  return (config.apiBaseUrl ?? origin).replace(/\/$/, '')
}

function shouldRefreshStoredToken(sessionData: ISessionData) {
  if (!sessionData.expire_at) {
    return false
  }

  return Date.now() + 30_000 >= sessionData.expire_at
}
