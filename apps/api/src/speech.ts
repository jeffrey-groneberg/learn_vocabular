import { DefaultAzureCredential } from '@azure/identity'
import { SpanStatusCode, trace } from '@opentelemetry/api'
import {
  AudioConfig,
  AudioInputStream,
  AudioStreamFormat,
  PronunciationAssessmentConfig,
  PronunciationAssessmentGradingSystem,
  PronunciationAssessmentGranularity,
  PronunciationAssessmentResult,
  ResultReason,
  SpeechConfig,
  SpeechRecognizer,
  SpeechSynthesisOutputFormat,
  SpeechSynthesizer,
  type SpeechRecognitionResult,
  type SpeechSynthesisResult,
} from 'microsoft-cognitiveservices-speech-sdk'
import type { SupportedLocale } from '@vocabulary/domain'

export interface SpeechAssessment {
  recognizedText: string
  pronunciationScore: number
}

export interface SpeechService {
  synthesize(text: string, locale: SupportedLocale): Promise<Buffer>
  assess(pcm: ArrayBuffer, reference: string, locale: SupportedLocale): Promise<SpeechAssessment | null>
}

const voiceByLocale: Record<SupportedLocale, string> = {
  'en-GB': 'en-GB-SoniaNeural',
  'de-DE': 'de-DE-KatjaNeural',
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
          PronunciationAssessmentGranularity.Word,
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
          const scores = PronunciationAssessmentResult.fromResult(result)
          span.setStatus({ code: SpanStatusCode.OK })
          return {
            recognizedText: result.text,
            pronunciationScore: scores.pronunciationScore,
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
