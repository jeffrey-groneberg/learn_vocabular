import { DefaultAzureCredential } from '@azure/identity'
import { SecretClient } from '@azure/keyvault-secrets'

export interface GatewayConfig {
  accessCodeHash: string
  cookieSigningKey: string
  rateLimitPepper: string
  internalApiCredential: string
  internalApiUrl: string
  storageTableEndpoint?: string
  storageTableName: string
  sessionCookieName: string
  sessionCookieSecure: boolean
  production: boolean
  port: number
  webDistPath?: string
}

const secretNames = {
  accessCodeHash: 'access-code-hash',
  cookieSigningKey: 'cookie-signing-key',
  rateLimitPepper: 'rate-limit-pepper',
  internalApiCredential: 'gateway-api-credential',
} as const

async function keyVaultSecrets(vaultUrl: string): Promise<Record<keyof typeof secretNames, string>> {
  const client = new SecretClient(vaultUrl, new DefaultAzureCredential())
  const entries = await Promise.all(
    Object.entries(secretNames).map(async ([key, name]) => {
      const secret = await client.getSecret(name)
      if (!secret.value) {
        throw new Error(`Required Key Vault secret ${name} is empty`)
      }
      return [key, secret.value] as const
    }),
  )
  return Object.fromEntries(entries) as Record<keyof typeof secretNames, string>
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`)
  }
  return value
}

function booleanEnvironment(name: string, fallback: boolean): boolean {
  const value = process.env[name]
  if (value === undefined) {
    return fallback
  }
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  throw new Error(`${name} must be either "true" or "false"`)
}

export async function loadGatewayConfig(): Promise<GatewayConfig> {
  const secrets = process.env.KEY_VAULT_URL
    ? await keyVaultSecrets(process.env.KEY_VAULT_URL)
    : {
        accessCodeHash: requiredEnvironment('ACCESS_CODE_HASH'),
        cookieSigningKey: requiredEnvironment('COOKIE_SIGNING_KEY'),
        rateLimitPepper: requiredEnvironment('RATE_LIMIT_PEPPER'),
        internalApiCredential: requiredEnvironment('INTERNAL_API_CREDENTIAL'),
      }

  return {
    ...secrets,
    internalApiUrl: requiredEnvironment('INTERNAL_API_URL').replace(/\/+$/u, ''),
    ...(process.env.STORAGE_TABLE_ENDPOINT
      ? { storageTableEndpoint: process.env.STORAGE_TABLE_ENDPOINT }
      : {}),
    storageTableName: process.env.STORAGE_TABLE_NAME ?? 'ratelimits',
    sessionCookieName:
      process.env.SESSION_COOKIE_NAME ?? '__Host-vocabulary-voice-tutor',
    sessionCookieSecure: booleanEnvironment('SESSION_COOKIE_SECURE', true),
    production: process.env.NODE_ENV === 'production',
    port: Number(process.env.PORT ?? (process.env.NODE_ENV === 'production' ? 8080 : 3000)),
    ...(process.env.WEB_DIST_PATH ? { webDistPath: process.env.WEB_DIST_PATH } : {}),
  }
}
