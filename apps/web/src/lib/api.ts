import {
  pronunciationResponseSchema,
  type PracticeMode,
  type SupportedLocale,
} from '@vocabulary/domain'

interface ApiFailureBody {
  error?: string
  retryAfterSeconds?: number
}

export class ApiError extends Error {
  readonly status: number
  readonly retryAfterSeconds?: number

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

async function throwApiError(response: Response): Promise<never> {
  let body: ApiFailureBody = {}
  try {
    body = (await response.json()) as ApiFailureBody
  } catch {
    body = {}
  }

  throw new ApiError(
    body.error ?? 'The service could not complete that request.',
    response.status,
    body.retryAfterSeconds,
  )
}

export async function getSession(): Promise<boolean> {
  const response = await fetch('/api/session', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    await throwApiError(response)
  }
  const body = (await response.json()) as { authenticated?: unknown }
  return body.authenticated === true
}

export async function createSession(code: string): Promise<void> {
  const response = await fetch('/api/session', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!response.ok) {
    await throwApiError(response)
  }
}

export async function logout(): Promise<void> {
  const response = await fetch('/api/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    await throwApiError(response)
  }
}

export async function requestSpeech(text: string, locale: SupportedLocale): Promise<Blob> {
  const response = await fetch('/api/tts', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, locale }),
  })
  if (!response.ok) {
    await throwApiError(response)
  }
  return response.blob()
}

function encodeHeaderText(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function assessPronunciation(
  audio: Blob,
  reference: string,
  locale: SupportedLocale,
  mode: PracticeMode,
) {
  const response = await fetch('/api/pronunciation', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'audio/wav',
      Accept: 'application/json',
      'X-Vocabulary-Locale': locale,
      'X-Vocabulary-Mode': mode,
      'X-Vocabulary-Reference': encodeHeaderText(reference),
    },
    body: audio,
  })
  if (!response.ok) {
    await throwApiError(response)
  }
  return pronunciationResponseSchema.parse(await response.json())
}
