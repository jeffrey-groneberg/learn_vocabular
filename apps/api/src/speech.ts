import { DefaultAzureCredential } from '@azure/identity'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import type {
  PronunciationError,
  PronunciationEvidence,
  PronunciationSoundPosition,
  PronunciationWordFeedback,
  SpeechPace,
  SupportedLocale,
} from '@vocabulary/domain'
import { pronunciationPassThreshold } from '@vocabulary/domain'
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
  synthesize(text: string, locale: SupportedLocale, pace: SpeechPace): Promise<Buffer>
  assess(pcm: ArrayBuffer, reference: string, locale: SupportedLocale): Promise<SpeechAssessment | null>
}

export function isNoSpeechAssessment(
  assessment: SpeechAssessment,
): boolean {
  if (!/[\p{L}\p{N}]/u.test(assessment.recognizedText)) {
    return true
  }
  const { scores, errors, problemWords } = assessment
  return (
    scores.overall === 0 &&
    scores.accuracy === 0 &&
    scores.fluency === 0 &&
    scores.completeness === 0 &&
    errors.length > 0 &&
    errors.every((error) => error === 'omission') &&
    problemWords.length > 0 &&
    problemWords.every(
      (word) =>
        word.errors.length > 0 &&
        word.errors.every((error) => error === 'omission'),
    )
  )
}

const voiceByLocale: Record<SupportedLocale, string> = {
  'en-US': 'en-US-JennyNeural',
  'de-DE': 'de-DE-KatjaNeural',
}

const rateByPace: Record<SpeechPace, string> = {
  normal: '-8%',
  slow: '-28%',
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
const breakErrorSchema = z.enum(['None', 'UnexpectedBreak', 'MissingBreak'])
const intonationErrorSchema = z.enum(['None', 'Monotone'])
const confidenceSchema = z.number().min(0).max(1)
const prosodyBreakConfidenceThreshold = 0.75

function speechErrorDiagnostic(error: unknown): string {
  if (error instanceof z.ZodError) {
    return `invalid-response:${error.issues
      .map((issue) => `${issue.path.join('.')}:${issue.code}`)
      .join(',')}`
  }
  if (error instanceof Error) {
    return `${error.name}:${error.message.replace(/\s+/gu, ' ').slice(0, 240)}`
  }
  return 'unknown'
}

const prosodyFeedbackSchema = z.object({
  Break: z
    .object({
      ErrorTypes: z.array(breakErrorSchema).optional().default([]),
      UnexpectedBreak: z.object({ Confidence: confidenceSchema }).optional(),
      MissingBreak: z.object({ Confidence: confidenceSchema }).optional(),
    })
    .optional(),
  Intonation: z
    .object({
      ErrorTypes: z.array(intonationErrorSchema).optional().default([]),
    })
    .optional(),
})

const detailedAssessmentSchema = z.object({
  NBest: z
    .array(
      z.object({
        PronunciationAssessment: z.object({
          AccuracyScore: scoreSchema,
          FluencyScore: scoreSchema,
          CompletenessScore: scoreSchema,
          ProsodyScore: scoreSchema.optional(),
          PronScore: scoreSchema,
        }),
        Words: z
          .array(
            z.object({
              Word: z.string().min(1).max(120),
              PronunciationAssessment: z.object({
                AccuracyScore: scoreSchema.optional(),
                ErrorType: azureErrorSchema,
              }),
              Feedback: z
                .object({
                  Prosody: prosodyFeedbackSchema.optional(),
                })
                .optional(),
              Phonemes: z
                .array(
                  z.object({
                    Phoneme: z.string().min(1).max(20),
                    PronunciationAssessment: z.object({
                      AccuracyScore: scoreSchema,
                      NBestPhonemes: z
                        .array(
                          z.object({
                            Phoneme: z.string().min(1).max(20),
                            Score: scoreSchema,
                          }),
                        )
                        .optional()
                        .default([]),
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

function prosodyErrors(
  feedback: z.infer<typeof prosodyFeedbackSchema> | undefined,
): PronunciationError[] {
  if (!feedback) {
    return []
  }
  const errors: PronunciationError[] = []
  const breakFeedback = feedback.Break
  if (
    breakFeedback?.ErrorTypes.includes('UnexpectedBreak') ||
    (breakFeedback?.UnexpectedBreak?.Confidence ?? 0) > prosodyBreakConfidenceThreshold
  ) {
    errors.push('unexpected-break')
  }
  if (
    breakFeedback?.ErrorTypes.includes('MissingBreak') ||
    (breakFeedback?.MissingBreak?.Confidence ?? 0) > prosodyBreakConfidenceThreshold
  ) {
    errors.push('missing-break')
  }
  if (feedback.Intonation?.ErrorTypes.includes('Monotone')) {
    errors.push('monotone')
  }
  return errors
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
    (word) => word.PronunciationAssessment.AccuracyScore ?? 0,
  )
  const phonemeScores = best.Words.flatMap((word) =>
    word.Phonemes.map((phoneme) => phoneme.PronunciationAssessment.AccuracyScore),
  )
  if (wordScores.length === 0) {
    throw new Error('Pronunciation assessment omitted required word scoring details')
  }
  const errors: PronunciationError[] = []
  const problemWords: PronunciationWordFeedback[] = []
  for (const [wordIndex, word] of best.Words.entries()) {
    const azureError = word.PronunciationAssessment.ErrorType
    const wordAccuracyScore =
      word.PronunciationAssessment.AccuracyScore ?? 0
    const mappedError =
      azureError === 'None'
        ? word.PronunciationAssessment.AccuracyScore === undefined
          ? 'mispronunciation'
          : undefined
        : errorMap[azureError]
    const detectedErrors = [
      ...(mappedError ? [mappedError] : []),
      ...prosodyErrors(word.Feedback?.Prosody),
    ]
    for (const error of detectedErrors) {
      if (!errors.includes(error)) {
        errors.push(error)
      }
    }

    let weakestPhonemeIndex = -1
    for (let index = 0; index < word.Phonemes.length; index += 1) {
      const score = word.Phonemes[index]?.PronunciationAssessment.AccuracyScore
      const weakestScore =
        weakestPhonemeIndex < 0
          ? undefined
          : word.Phonemes[weakestPhonemeIndex]?.PronunciationAssessment.AccuracyScore
      if (
        score !== undefined &&
        (weakestScore === undefined || score < weakestScore)
      ) {
        weakestPhonemeIndex = index
      }
    }

    const weakestPhoneme =
      weakestPhonemeIndex < 0 ? undefined : word.Phonemes[weakestPhonemeIndex]
    const weakestSoundScore = weakestPhoneme?.PronunciationAssessment.AccuracyScore
    const wordSpecificErrors = [
      ...new Set(detectedErrors.filter((error) => error !== 'monotone')),
    ]
    const hasWeakSound =
      weakestSoundScore !== undefined && weakestSoundScore < pronunciationPassThreshold
    if (
      wordAccuracyScore >= pronunciationPassThreshold &&
      wordSpecificErrors.length === 0
    ) {
      continue
    }

    const heardCandidate = weakestPhoneme?.PronunciationAssessment.NBestPhonemes[0]
    const heardSound =
      heardCandidate && heardCandidate.Phoneme !== weakestPhoneme?.Phoneme
        ? heardCandidate.Phoneme
        : undefined
    const weakestSoundPosition = soundPosition(
      weakestPhonemeIndex,
      word.Phonemes.length,
    )
    problemWords.push({
      word: word.Word,
      index: wordIndex,
      accuracyScore: wordAccuracyScore,
      errors: wordSpecificErrors,
      ...(hasWeakSound && weakestPhoneme && weakestSoundScore !== undefined
        ? {
            weakestSound: {
              expected: weakestPhoneme.Phoneme,
              ...(heardSound ? { heard: heardSound } : {}),
              score: weakestSoundScore,
              ...(weakestSoundPosition
                ? { position: weakestSoundPosition }
                : {}),
            },
          }
        : {}),
    })
  }

  return {
    scores: {
      overall: best.PronunciationAssessment.PronScore,
      accuracy: best.PronunciationAssessment.AccuracyScore,
      fluency: best.PronunciationAssessment.FluencyScore,
      completeness: best.PronunciationAssessment.CompletenessScore,
      prosody: best.PronunciationAssessment.ProsodyScore ?? null,
      minimumWord: Math.min(...wordScores),
      minimumPhoneme:
        phonemeScores.length === 0 ? null : Math.min(...phonemeScores),
    },
    errors,
    problemWords,
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

export function createSpeechSsml(
  text: string,
  locale: SupportedLocale,
  pace: SpeechPace,
): string {
  return [
    `<speak version="1.0" xml:lang="${locale}">`,
    `<voice name="${voiceByLocale[locale]}">`,
    `<prosody rate="${rateByPace[pace]}">${escapeXml(text)}</prosody>`,
    '</voice>',
    '</speak>',
  ].join('')
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

export function createPronunciationAssessmentConfig(
  reference: string,
): PronunciationAssessmentConfig {
  const assessment = new PronunciationAssessmentConfig(
    reference,
    PronunciationAssessmentGradingSystem.HundredMark,
    PronunciationAssessmentGranularity.Phoneme,
    true,
  )
  assessment.phonemeAlphabet = 'IPA'
  assessment.nbestPhonemeCount = 5
  assessment.enableProsodyAssessment = true
  return assessment
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

  async synthesize(text: string, locale: SupportedLocale, pace: SpeechPace): Promise<Buffer> {
    return trace.getTracer('vocabulary-speech').startActiveSpan('speech.tts', async (span) => {
      span.setAttribute('app.locale', locale)
      span.setAttribute('app.tts_pace', pace)
      const config = this.config()
      config.speechSynthesisVoiceName = voiceByLocale[locale]
      config.speechSynthesisOutputFormat =
        SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
      const synthesizer = new SpeechSynthesizer(config)
      try {
        const ssml = createSpeechSsml(text, locale, pace)
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
        console.error(
          'speech-synthesis-failed',
          speechErrorDiagnostic(error),
        )
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
        const assessment = createPronunciationAssessmentConfig(reference)
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
          const speechAssessment = {
            recognizedText: result.text,
            ...evidence,
          }
          if (isNoSpeechAssessment(speechAssessment)) {
            span.setAttribute('app.outcome', 'no-speech')
            span.setStatus({ code: SpanStatusCode.OK })
            return null
          }
          span.setStatus({ code: SpanStatusCode.OK })
          return speechAssessment
        } catch (error) {
          console.error(
            'speech-pronunciation-failed',
            speechErrorDiagnostic(error),
          )
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
