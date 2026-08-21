import { DefaultAzureCredential } from '@azure/identity'
import { SecretClient } from '@azure/keyvault-secrets'

export interface ApiConfig {
  internalApiCredential: string
  speechEndpoint: string
  port: number
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`)
  }
  return value
}

export async function loadApiConfig(): Promise<ApiConfig> {
  let internalApiCredential =
    process.env.INTERNAL_API_CREDENTIAL ?? process.env.GATEWAY_API_CREDENTIAL
  if (!internalApiCredential && process.env.KEY_VAULT_URL) {
    const client = new SecretClient(process.env.KEY_VAULT_URL, new DefaultAzureCredential())
    internalApiCredential = (await client.getSecret('gateway-api-credential')).value
  }
  if (!internalApiCredential) {
    throw new Error('The gateway API credential could not be loaded')
  }

  return {
    internalApiCredential,
    speechEndpoint: requiredEnvironment('SPEECH_ENDPOINT'),
    port: Number(process.env.PORT ?? (process.env.NODE_ENV === 'production' ? 8080 : 3001)),
  }
}
