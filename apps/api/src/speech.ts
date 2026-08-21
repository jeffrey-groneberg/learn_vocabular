import { DefaultAzureCredential } from '@azure/identity'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import type {
  PronunciationError,
  PronunciationEvidence,
  PronunciationSoundPosition,
  SupportedLocale,
} from '@vocabulary/domain'
import {
  AudioConfig,
  AudioInputStream,
  AudioStreamFormat,
  PronunciationAssessmentConfig,
  PronunciationAssessmentGradingSystem,
  PronunciationAssessmentGranularity,
  PropertyId,
  ResultReason,
  SpeechConfig,
  SpeechRecognizer,
  SpeechSynthesisOutputFormat,
  SpeechSynthesizer,
  type SpeechRecognitionResult,
  type SpeechSynthesisResult,
} from 'microsoft-cognitiveservices-speech-sdk'
import { z } from 'zod'

export interface SpeechAssessment extends PronunciationEvidence {
  recognizedText: string
}

export interface SpeechService {
  synthesize(text: string, locale: SupportedLocale): Promise<Buffer>
  assess(pcm: ArrayBuffer, reference: string, locale: SupportedLocale): Promise<SpeechAssessment | null>
}

const voiceByLocale: Record<SupportedLocale, string> = {
  'en-GB': 'en-GB-SoniaNeural',
  'de-DE': 'de-DE-KatjaNeural',
}

const scoreSchema = z.number().min(0).max(100)
const azureErrorSchema = z.enum([
  'None',
  'Omission',
  'Insertion',
  'Mispronunciation',
  'UnexpectedBreak',
  'MissingBreak',
  'Monotone',
])
type AzureError = z.infer<typeof azureErrorSchema>

const detailedAssessmentSchema = z.object({
  NBest: z
    .array(
      z.object({
        PronunciationAssessment: z.object({
          AccuracyScore: scoreSchema,
          FluencyScore: scoreSchema,
          CompletenessScore: scoreSchema,
          PronScore: scoreSchema,
        }),
        Words: z
          .array(
            z.object({
              PronunciationAssessment: z.object({
                AccuracyScore: scoreSchema,
                ErrorType: azureErrorSchema,
              }),
              Phonemes: z
                .array(
                  z.object({
                    PronunciationAssessment: z.object({
                      AccuracyScore: scoreSchema,
                    }),
                  }),
                )
                .optional()
                .default([]),
            }),
          )
          .optional()
          .default([]),
      }),
    )
    .min(1),
})

const errorMap: Record<Exclude<AzureError, 'None'>, PronunciationError> = {
  Omission: 'omission',
  Insertion: 'insertion',
  Mispronunciation: 'mispronunciation',
  UnexpectedBreak: 'unexpected-break',
  MissingBreak: 'missing-break',
  Monotone: 'monotone',
}

function soundPosition(
  index: number,
  count: number,
): PronunciationSoundPosition | undefined {
  if (index < 0 || count <= 1) {
    return undefined
  }
  const ratio = index / (count - 1)
  return ratio <= 1 / 3 ? 'start' : ratio >= 2 / 3 ? 'end' : 'middle'
}

export function parsePronunciationAssessmentJson(json: string): PronunciationEvidence {
  const rawAssessment: unknown = JSON.parse(json)
  const parsed = detailedAssessmentSchema.parse(rawAssessment)
  const best = parsed.NBest[0]
  if (!best) {
    throw new Error('Pronunciation assessment did not include a best result')
  }

  const wordScores = best.Words.map(
    (word) => word.PronunciationAssessment.AccuracyScore,
  )
  const phonemeScores = best.Words.flatMap((word) =>
    word.Phonemes.map((phoneme) => phoneme.PronunciationAssessment.AccuracyScore),
  )
  if (wordScores.length === 0 || phonemeScores.length === 0) {
    throw new Error('Pronunciation assessment omitted required scoring details')
  }
  const errors: PronunciationError[] = []
  for (const word of best.Words) {
    const error = word.PronunciationAssessment.ErrorType
    if (error !== 'None' && !errors.includes(errorMap[error])) {
      errors.push(errorMap[error])
    }
  }

  let weakestPhonemeIndex = -1
  for (let index = 0; index < phonemeScores.length; index += 1) {
    const score = phonemeScores[index]
    const weakestScore =
      weakestPhonemeIndex < 0 ? undefined : phonemeScores[weakestPhonemeIndex]
    if (
      score !== undefined &&
      (weakestScore === undefined || score < weakestScore)
    ) {
      weakestPhonemeIndex = index
    }
  }
  const weakestSoundPosition = soundPosition(weakestPhonemeIndex, phonemeScores.length)

  return {
    scores: {
      overall: best.PronunciationAssessment.PronScore,
      accuracy: best.PronunciationAssessment.AccuracyScore,
      fluency: best.PronunciationAssessment.FluencyScore,
      completeness: best.PronunciationAssessment.CompletenessScore,
      minimumWord: Math.min(...wordScores),
      minimumPhoneme: Math.min(...phonemeScores),
    },
    errors,
    ...(weakestSoundPosition ? { weakestSoundPosition } : {}),
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function synthesisPromise(synthesizer: SpeechSynthesizer, ssml: string): Promise<SpeechSynthesisResult> {
  return new Promise((resolve, reject) => {
    synthesizer.speakSsmlAsync(ssml, resolve, reject)
  })
}

function recognitionPromise(recognizer: SpeechRecognizer): Promise<SpeechRecognitionResult> {
  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(resolve, reject)
  })
}

export class AzureSpeechService implements SpeechService {
  private readonly endpoint: URL
  private readonly credential = new DefaultAzureCredential()

  constructor(endpoint: string) {
    this.endpoint = new URL(endpoint)
  }

  private config(): SpeechConfig {
    return SpeechConfig.fromEndpoint(this.endpoint, this.credential)
  }

  async synthesize(text: string, locale: SupportedLocale): Promise<Buffer> {
    return trace.getTracer('vocabulary-speech').startActiveSpan('speech.tts', async (span) => {
      span.setAttribute('app.locale', locale)
      const config = this.config()
      config.speechSynthesisVoiceName = voiceByLocale[locale]
      config.speechSynthesisOutputFormat =
        SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
      const synthesizer = new SpeechSynthesizer(config)
      try {
        const ssml = [
          `<speak version="1.0" xml:lang="${locale}">`,
          `<voice name="${voiceByLocale[locale]}">`,
          `<prosody rate="-8%">${escapeXml(text)}</prosody>`,
          '</voice>',
          '</speak>',
        ].join('')
        const result = await synthesisPromise(synthesizer, ssml)
        if (
          result.reason !== ResultReason.SynthesizingAudioCompleted ||
          result.audioData.byteLength === 0
        ) {
          throw new Error('Speech synthesis did not complete')
        }
        span.setStatus({ code: SpanStatusCode.OK })
        return Buffer.from(result.audioData)
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'speech-unavailable' })
        throw error
      } finally {
        synthesizer.close()
        span.end()
      }
    })
  }

  async assess(
    pcm: ArrayBuffer,
    reference: string,
    locale: SupportedLocale,
  ): Promise<SpeechAssessment | null> {
    return trace
      .getTracer('vocabulary-speech')
      .startActiveSpan('speech.pronunciation', async (span) => {
        span.setAttribute('app.locale', locale)
        const format = AudioStreamFormat.getWaveFormatPCM(16_000, 16, 1)
        const stream = AudioInputStream.createPushStream(format)
        stream.write(pcm)
        stream.close()

        const config = this.config()
        config.speechRecognitionLanguage = locale
        const recognizer = new SpeechRecognizer(config, AudioConfig.fromStreamInput(stream))
        const assessment = new PronunciationAssessmentConfig(
          reference,
          PronunciationAssessmentGradingSystem.HundredMark,
          PronunciationAssessmentGranularity.Phoneme,
          true,
        )
        assessment.applyTo(recognizer)

        try {
          const result = await recognitionPromise(recognizer)
          if (result.reason === ResultReason.NoMatch) {
            span.setAttribute('app.outcome', 'no-speech')
            span.setStatus({ code: SpanStatusCode.OK })
            return null
          }
          if (result.reason !== ResultReason.RecognizedSpeech) {
            throw new Error('Speech recognition did not complete')
          }
          const evidence = parsePronunciationAssessmentJson(
            result.properties.getProperty(PropertyId.SpeechServiceResponse_JsonResult),
          )
          span.setStatus({ code: SpanStatusCode.OK })
          return {
            recognizedText: result.text,
            ...evidence,
          }
        } catch (error) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'speech-unavailable' })
          throw error
        } finally {
          recognizer.close()
          format.close()
          span.end()
        }
      })
  }
}
