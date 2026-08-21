import { answersMatch } from './normalization.js'
import {
  pronunciationChecks,
  type PronunciationCheck,
  type PronunciationError,
  type PronunciationEvidence,
  type SpokenOutcome,
  type SupportedLocale,
} from './types.js'

export const pronunciationPassThreshold = 80
const apostrophePunctuation = /['’ʼ]/gu
const displayPunctuation = /\p{P}+/gu

function withoutDisplayPunctuation(value: string): string {
  return value
    .replace(apostrophePunctuation, '')
    .replace(displayPunctuation, ' ')
    .trim()
}

export interface PronunciationDecision {
  outcome: SpokenOutcome
  matchesReference: boolean
  passesPronunciation: boolean
  failedChecks: PronunciationCheck[]
  errors: PronunciationError[]
}

export function evaluatePronunciation(
  recognizedText: string,
  referenceText: string,
  locale: SupportedLocale,
  evidence: PronunciationEvidence,
): PronunciationDecision {
  const matchesReference = answersMatch(
    withoutDisplayPunctuation(recognizedText),
    withoutDisplayPunctuation(referenceText),
    locale,
  )
  const failedChecks = pronunciationChecks.filter(
    (check) => {
      const score = evidence.scores[check]
      return score !== null && score < pronunciationPassThreshold
    },
  )
  const errors = [...new Set(evidence.errors)]
  const passesPronunciation = failedChecks.length === 0 && errors.length === 0

  return {
    outcome: !matchesReference
      ? 'different-word'
      : passesPronunciation
        ? 'correct'
        : 'pronunciation-retry',
    matchesReference,
    passesPronunciation,
    failedChecks,
    errors,
  }
}
