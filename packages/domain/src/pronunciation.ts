import { answersMatch } from './normalization.js'
import type { SpokenOutcome, SupportedLocale } from './types.js'

export const pronunciationPassThreshold = 80
const surroundingPunctuation = /^\p{P}+|\p{P}+$/gu

function withoutDisplayPunctuation(value: string): string {
  return value.trim().replace(surroundingPunctuation, '')
}

export interface PronunciationDecision {
  outcome: SpokenOutcome
  matchesReference: boolean
  passesPronunciation: boolean
}

export function evaluatePronunciation(
  recognizedText: string,
  referenceText: string,
  locale: SupportedLocale,
  pronunciationScore: number,
): PronunciationDecision {
  const matchesReference = answersMatch(
    withoutDisplayPunctuation(recognizedText),
    withoutDisplayPunctuation(referenceText),
    locale,
  )
  const passesPronunciation = pronunciationScore >= pronunciationPassThreshold

  return {
    outcome: !matchesReference
      ? 'different-word'
      : passesPronunciation
        ? 'correct'
        : 'pronunciation-retry',
    matchesReference,
    passesPronunciation,
  }
}
