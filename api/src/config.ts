export type AppConfig = {
  apiBaseUrl?: string
  ghlClientId: string
  ghlClientSecret: string
  ghlOauthScopes: string
  ghlVersionId?: string
  ghlAppId?: string
  ghlAppSharedSecret?: string
  appSessionSecret?: string
  sessionDbPath: string
  copilotDbPath: string
  openRouterApiKey?: string
  openRouterModel?: string
  openRouterBaseUrl: string
  webhookSignaturePublicKey?: string
  webhookPublicKey?: string
}

function readEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]

    if (value) {
      return value
    }
  }

  return undefined
}

export function getAppConfig(): AppConfig {
  const sessionDbPath = readEnv('GHL_SESSION_DB_PATH', 'SQLITE_DB_PATH') ?? './data/ghl-sessions.sqlite'

  return {
    apiBaseUrl: readEnv('APP_ORIGIN', 'API_BASE_URL', 'APP_BASE_URL', 'PUBLIC_API_BASE_URL'),
    ghlClientId: readEnv('GHL_CLIENT_ID', 'HIGHLEVEL_CLIENT_ID') ?? '',
    ghlClientSecret: readEnv('GHL_CLIENT_SECRET', 'HIGHLEVEL_CLIENT_SECRET') ?? '',
    ghlOauthScopes: readEnv('GHL_OAUTH_SCOPES', 'HIGHLEVEL_OAUTH_SCOPES') ?? '',
    ghlVersionId: readEnv('GHL_VERSION_ID', 'HIGHLEVEL_VERSION_ID'),
    ghlAppId: readEnv('GHL_APP_ID', 'HIGHLEVEL_APP_ID'),
    ghlAppSharedSecret: readEnv('GHL_APP_SHARED_SECRET', 'HIGHLEVEL_APP_SHARED_SECRET'),
    appSessionSecret: readEnv('APP_SESSION_SECRET'),
    sessionDbPath,
    copilotDbPath: readEnv('COPILOT_DB_PATH') ?? sessionDbPath,
    openRouterApiKey: readEnv('OPENROUTER_API_KEY'),
    openRouterModel: readEnv('OPENROUTER_MODEL'),
    openRouterBaseUrl: readEnv('OPENROUTER_BASE_URL') ?? 'https://openrouter.ai/api/v1',
    webhookSignaturePublicKey: readEnv('WEBHOOK_SIGNATURE_PUBLIC_KEY'),
    webhookPublicKey: readEnv('WEBHOOK_PUBLIC_KEY'),
  }
}

export function requireOAuthConfig(config: AppConfig) {
  const missing = []

  if (!config.ghlClientId) {
    missing.push('GHL_CLIENT_ID')
  }

  if (!config.ghlClientSecret) {
    missing.push('GHL_CLIENT_SECRET')
  }

  if (missing.length > 0) {
    throw new Error(`Missing required HighLevel OAuth env vars: ${missing.join(', ')}`)
  }
}
