import { afterEach, describe, expect, it } from 'vitest'
import { buildApi } from './app.js'
import type { ApiConfig } from './config.js'
import type { SpeechService } from './speech.js'

const config: ApiConfig = {
  internalApiCredential: 'internal-credential-with-fixed-length',
  speechEndpoint: 'https://speech.example.test',
  port: 0,
}

const speech: SpeechService = {
  async synthesize() {
    return Buffer.from('audio')
  },
  async assess() {
    return {
      recognizedText: 'Apfel.',
      scores: {
        overall: 84,
        accuracy: 86,
        fluency: 88,
        completeness: 100,
        minimumWord: 85,
        minimumPhoneme: 81,
      },
      errors: [],
    }
  },
}

const apps: Awaited<ReturnType<typeof buildApi>>[] = []
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

function wav(durationMs = 250): Buffer {
  const sampleCount = Math.floor(16_000 * (durationMs / 1_000))
  const buffer = Buffer.alloc(44 + sampleCount * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + sampleCount * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(16_000, 24)
  buffer.writeUInt32LE(32_000, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(sampleCount * 2, 40)
  return buffer
}

function referenceHeader(value: string): string {
  return Buffer.from(value).toString('base64url')
}

describe('internal Speech API', () => {
  it('does not expose routes without the gateway credential', async () => {
    const app = await buildApi(config, speech)
    apps.push(app)
    const response = await app.inject({
      method: 'POST',
      url: '/tts',
      payload: { text: 'apple', locale: 'en-GB' },
    })
    expect(response.statusCode).toBe(404)
  })

  it('withholds recognized text in Test mode', async () => {
    const app = await buildApi(config, speech)
    apps.push(app)
    const response = await app.inject({
      method: 'POST',
      url: '/pronunciation',
      headers: {
        'content-type': 'audio/wav',
        'x-internal-gateway-key': config.internalApiCredential,
        'x-vocabulary-reference': referenceHeader('Apfel'),
        'x-vocabulary-locale': 'de-DE',
        'x-vocabulary-mode': 'test',
      },
      payload: wav(),
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      outcome: 'correct',
      pronunciationScore: 84,
      scores: {
        overall: 84,
        accuracy: 86,
        fluency: 88,
        completeness: 100,
        minimumWord: 85,
        minimumPhoneme: 81,
      },
      failedChecks: [],
      errors: [],
    })
  })

  it('fails when one phoneme is below 80 and returns targeted feedback', async () => {
    const app = await buildApi(config, {
      ...speech,
      async assess() {
        return {
          recognizedText: 'apple',
          scores: {
            overall: 90,
            accuracy: 90,
            fluency: 90,
            completeness: 100,
            minimumWord: 88,
            minimumPhoneme: 72,
          },
          errors: [],
          weakestSoundPosition: 'end',
        }
      },
    })
    apps.push(app)
    const response = await app.inject({
      method: 'POST',
      url: '/pronunciation',
      headers: {
        'content-type': 'audio/wav',
        'x-internal-gateway-key': config.internalApiCredential,
        'x-vocabulary-reference': referenceHeader('apple'),
        'x-vocabulary-locale': 'en-GB',
        'x-vocabulary-mode': 'learn',
      },
      payload: wav(),
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      outcome: 'pronunciation-retry',
      pronunciationScore: 90,
      failedChecks: ['minimumPhoneme'],
      weakestSoundPosition: 'end',
    })
  })

  it('rejects unsupported audio before calling Speech', async () => {
    const app = await buildApi(config, speech)
    apps.push(app)
    const response = await app.inject({
      method: 'POST',
      url: '/pronunciation',
      headers: {
        'content-type': 'audio/wav',
        'x-internal-gateway-key': config.internalApiCredential,
        'x-vocabulary-reference': referenceHeader('Apfel'),
        'x-vocabulary-locale': 'de-DE',
        'x-vocabulary-mode': 'learn',
      },
      payload: Buffer.from('not a wav'),
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'unsupported-audio' })
  })
})
