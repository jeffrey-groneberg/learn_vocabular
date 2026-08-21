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
const surroundingPunctuation = /^\p{P}+|\p{P}+$/gu

function withoutDisplayPunctuation(value: string): string {
  return value.trim().replace(surroundingPunctuation, '')
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
    (check) => evidence.scores[check] < pronunciationPassThreshold,
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
