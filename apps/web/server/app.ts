import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { sessionRequestSchema, ttsRequestSchema } from '@vocabulary/domain'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { GatewayConfig } from './config.js'
import { verifyAccessCode } from './security/access-code.js'
import {
  AzureTableLockoutStore,
  MemoryLockoutStore,
  type LockoutStore,
} from './security/lockout.js'
import { createSessionToken, verifySessionToken } from './security/session-token.js'
import { privateSourceKey, trustedSourceBucket } from './security/source-key.js'

const maximumAudioBytes = 500_000
const defaultWebDist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

function hasValidSession(request: FastifyRequest, config: GatewayConfig): boolean {
  const token = request.cookies[config.sessionCookieName]
  return typeof token === 'string' && verifySessionToken(token, config.cookieSigningKey)
}

function sameOrigin(request: FastifyRequest): boolean {
  if (request.headers['sec-fetch-site'] === 'cross-site') {
    return false
  }
  const origin = request.headers.origin
  if (!origin) {
    return true
  }
  try {
    return new URL(origin).host === request.headers.host
  } catch {
    return false
  }
}

async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
  config: GatewayConfig,
): Promise<void> {
  if (!hasValidSession(request, config)) {
    await reply.status(401).send({ error: 'not-authenticated' })
  }
}

function forwardedTraceHeaders(request: FastifyRequest): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const name of ['traceparent', 'tracestate'] as const) {
    const value = request.headers[name]
    if (typeof value === 'string' && value.length <= 512) {
      headers[name] = value
    }
  }
  return headers
}

async function forwardJson(
  path: '/tts',
  request: FastifyRequest,
  reply: FastifyReply,
  config: GatewayConfig,
  body: unknown,
) {
  const response = await fetch(`${config.internalApiUrl}${path}`, {
    method: 'POST',
    headers: {
      ...forwardedTraceHeaders(request),
      'content-type': 'application/json',
      'x-internal-gateway-key': config.internalApiCredential,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  reply.status(response.status)
  reply.header('content-type', response.headers.get('content-type') ?? 'application/octet-stream')
  if (!response.body) {
    return reply.send()
  }
  return reply.send(Readable.fromWeb(response.body))
}

function decodeReference(value: string | undefined): string | null {
  if (!value || value.length > 640) {
    return null
  }
  try {
    return Buffer.from(value, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

export async function buildGateway(
  config: GatewayConfig,
  suppliedLockoutStore?: LockoutStore,
) {
  const app = Fastify({
    bodyLimit: maximumAudioBytes,
    logger: false,
    trustProxy: false,
    requestTimeout: 25_000,
  })
  await app.register(cookie)

  app.addContentTypeParser('audio/wav', (_request, payload, done) => {
    done(null, payload)
  })

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff')
    reply.header('referrer-policy', 'no-referrer')
    reply.header('permissions-policy', 'camera=(), geolocation=(), microphone=(self)')
    reply.header('cross-origin-opener-policy', 'same-origin')
    reply.header('x-frame-options', 'DENY')
    reply.header(
      'content-security-policy',
      "default-src 'self'; base-uri 'none'; connect-src 'self' https://*.in.applicationinsights.azure.com; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' blob:; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'",
    )
    if (config.production) {
      reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains')
    }
    if (request.url === '/health/live') {
      reply.header('cache-control', 'no-store')
    }
    return payload
  })

  const lockoutStore =
    suppliedLockoutStore ??
    (config.storageTableEndpoint
      ? new AzureTableLockoutStore(config.storageTableEndpoint, config.storageTableName)
      : new MemoryLockoutStore())

  app.get('/health/live', async () => ({ ok: true }))
  app.get('/health/ready', async () => ({ ready: true }))

  app.get('/api/session', async (request, reply) => {
    reply.header('cache-control', 'no-store')
    return { authenticated: hasValidSession(request, config) }
  })

  app.post('/api/session', async (request, reply) => {
    reply.header('cache-control', 'no-store')
    if (!sameOrigin(request)) {
      return reply.status(403).send({ error: 'invalid-request' })
    }
    const parsed = sessionRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid-request' })
    }
    const bucket = trustedSourceBucket(
      request.headers['x-forwarded-for'] ??
        (config.production ? undefined : request.ip),
    )
    if (!bucket) {
      return reply.status(400).send({ error: 'invalid-request' })
    }
    const sourceKey = privateSourceKey(bucket, config.rateLimitPepper)
    const now = new Date()
    const existingStatus = await lockoutStore.status(sourceKey, now)
    if (existingStatus.blocked) {
      reply.header('retry-after', existingStatus.retryAfterSeconds)
      return reply.status(429).send({
        error: 'blocked',
        retryAfterSeconds: existingStatus.retryAfterSeconds,
      })
    }

    if (!(await verifyAccessCode(parsed.data.code, config.accessCodeHash))) {
      const updatedStatus = await lockoutStore.failure(sourceKey, now)
      if (updatedStatus.blocked) {
        reply.header('retry-after', updatedStatus.retryAfterSeconds)
        return reply.status(429).send({
          error: 'blocked',
          retryAfterSeconds: updatedStatus.retryAfterSeconds,
        })
      }
      return reply.status(401).send({ error: 'not-authenticated' })
    }

    await lockoutStore.clear(sourceKey)
    const session = createSessionToken(config.cookieSigningKey, now)
    reply.setCookie(config.sessionCookieName, session.token, {
      path: '/',
      httpOnly: true,
      secure: config.sessionCookieSecure,
      sameSite: 'strict',
      expires: session.expiresAt,
    })
    return reply.status(204).send()
  })

  app.post('/api/logout', async (request, reply) => {
    if (!sameOrigin(request)) {
      return reply.status(403).send({ error: 'invalid-request' })
    }
    reply.clearCookie(config.sessionCookieName, {
      path: '/',
      httpOnly: true,
      secure: config.sessionCookieSecure,
      sameSite: 'strict',
    })
    return reply.status(204).send()
  })

  app.post('/api/tts', async (request, reply) => {
    await requireSession(request, reply, config)
    if (reply.sent) {
      return
    }
    if (!sameOrigin(request)) {
      return reply.status(403).send({ error: 'invalid-request' })
    }
    const parsed = ttsRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid-request' })
    }
    return forwardJson('/tts', request, reply, config, parsed.data)
  })

  app.post('/api/pronunciation', async (request, reply) => {
    await requireSession(request, reply, config)
    if (reply.sent) {
      return
    }
    if (!sameOrigin(request)) {
      return reply.status(403).send({ error: 'invalid-request' })
    }
    const contentLength = Number(request.headers['content-length'])
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 45 ||
      contentLength > maximumAudioBytes
    ) {
      return reply
        .status(contentLength > maximumAudioBytes ? 413 : 400)
        .send({ error: contentLength > maximumAudioBytes ? 'payload-too-large' : 'invalid-request' })
    }
    const reference = decodeReference(
      typeof request.headers['x-vocabulary-reference'] === 'string'
        ? request.headers['x-vocabulary-reference']
        : undefined,
    )
    const locale = request.headers['x-vocabulary-locale']
    const mode = request.headers['x-vocabulary-mode']
    if (
      !reference ||
      (locale !== 'en-US' && locale !== 'de-DE') ||
      (mode !== 'learn' && mode !== 'test')
    ) {
      return reply.status(400).send({ error: 'invalid-request' })
    }

    let response: Response
    try {
      response = await fetch(`${config.internalApiUrl}/pronunciation`, {
        method: 'POST',
        headers: {
          ...forwardedTraceHeaders(request),
          'content-type': 'audio/wav',
          'content-length': String(contentLength),
          'x-internal-gateway-key': config.internalApiCredential,
          'x-vocabulary-locale': locale,
          'x-vocabulary-mode': mode,
          'x-vocabulary-reference': request.headers[
            'x-vocabulary-reference'
          ] as string,
        },
        body: request.body as Readable,
        duplex: 'half',
        signal: AbortSignal.timeout(25_000),
      })
    } catch (error) {
      console.error(
        'pronunciation-forward-failed',
        error instanceof Error ? error.name : 'unknown',
      )
      return reply.status(503).send({ error: 'speech-unavailable' })
    }
    if (!response.ok) {
      console.error('pronunciation-api-failed', response.status)
    }
    reply.status(response.status)
    reply.header('content-type', response.headers.get('content-type') ?? 'application/json')
    if (!response.body) {
      return reply.send()
    }
    return reply.send(Readable.fromWeb(response.body))
  })

  const webDistPath = config.webDistPath ?? defaultWebDist
  if (existsSync(join(webDistPath, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      wildcard: false,
      setHeaders(response, path) {
        response.header(
          'cache-control',
          path.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
        )
      },
    })
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/health/')) {
        return reply.status(404).send({ error: 'invalid-request' })
      }
      reply.header('cache-control', 'no-cache')
      return reply.sendFile('index.html')
    })
  } else {
    app.setNotFoundHandler(async (_request, reply) =>
      reply.status(404).send({ error: 'invalid-request' }),
    )
  }

  return app
}
