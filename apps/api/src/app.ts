import {
  evaluatePronunciation,
  pronunciationMetadataSchema,
  ttsRequestSchema,
  type PracticeMode,
  type SupportedLocale,
} from '@vocabulary/domain'
import Fastify from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import type { ApiConfig } from './config.js'
import type { SpeechService } from './speech.js'
import { parsePcmWav } from './wav.js'

const maximumAudioBytes = 300_000
const maximumDurationMs = 8_250

function validCredential(actual: string | string[] | undefined, expected: string): boolean {
  if (typeof actual !== 'string') {
    return false
  }
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

function decodeReference(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string' || value.length > 640) {
    return null
  }
  try {
    return Buffer.from(value, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

export async function buildApi(config: ApiConfig, speech: SpeechService) {
  const app = Fastify({
    logger: false,
    bodyLimit: maximumAudioBytes,
    requestTimeout: 25_000,
  })

  app.addContentTypeParser('audio/wav', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body)
  })

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('cache-control', 'no-store')
    reply.header('x-content-type-options', 'nosniff')
    return payload
  })

  app.get('/health/live', async () => ({ ok: true }))
  app.get('/health/ready', async () => ({ ready: true }))

  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health/live' || request.url === '/health/ready') {
      return
    }
    if (!validCredential(request.headers['x-internal-gateway-key'], config.internalApiCredential)) {
      await reply.status(404).send({ error: 'invalid-request' })
    }
  })

  app.post('/tts', async (request, reply) => {
    const parsed = ttsRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid-request' })
    }
    try {
      const audio = await speech.synthesize(parsed.data.text, parsed.data.locale)
      reply.header('content-type', 'audio/mpeg')
      reply.header('content-length', audio.byteLength)
      return reply.send(audio)
    } catch {
      return reply.status(503).send({ error: 'speech-unavailable' })
    }
  })

  app.post('/pronunciation', async (request, reply) => {
    const reference = decodeReference(request.headers['x-vocabulary-reference'])
    const parsed = pronunciationMetadataSchema.safeParse({
      reference,
      locale: request.headers['x-vocabulary-locale'],
      mode: request.headers['x-vocabulary-mode'],
    })
    if (!parsed.success || !Buffer.isBuffer(request.body)) {
      return reply.status(400).send({ error: 'invalid-request' })
    }

    let pcm: ArrayBuffer
    try {
      const wav = parsePcmWav(request.body)
      if (wav.durationMs < 150 || wav.durationMs > maximumDurationMs) {
        return reply.status(400).send({ error: 'unsupported-audio' })
      }
      pcm = wav.pcm
    } catch {
      return reply.status(400).send({ error: 'unsupported-audio' })
    }

    try {
      const result = await speech.assess(
        pcm,
        parsed.data.reference,
        parsed.data.locale as SupportedLocale,
      )
      if (!result) {
        return {
          outcome: 'no-speech',
          pronunciationScore: null,
          scores: null,
          failedChecks: [],
          errors: [],
        }
      }
      const decision = evaluatePronunciation(
        result.recognizedText,
        parsed.data.reference,
        parsed.data.locale as SupportedLocale,
        result,
      )
      const mode = parsed.data.mode as PracticeMode
      return {
        outcome: decision.outcome,
        pronunciationScore: result.scores.overall,
        scores: result.scores,
        failedChecks: decision.failedChecks,
        errors: decision.errors,
        ...(result.weakestSoundPosition
          ? { weakestSoundPosition: result.weakestSoundPosition }
          : {}),
        ...(mode === 'learn' ? { recognizedText: result.recognizedText } : {}),
      }
    } catch {
      return reply.status(503).send({ error: 'speech-unavailable' })
    }
  })

  app.setNotFoundHandler(async (_request, reply) =>
    reply.status(404).send({ error: 'invalid-request' }),
  )
  return app
}
