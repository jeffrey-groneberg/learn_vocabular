export const supportedLocales = ['en-GB', 'de-DE'] as const

export type SupportedLocale = (typeof supportedLocales)[number]
export type PracticeDirection = 'english-to-german' | 'german-to-english' | 'mixed'
export type PracticeMode = 'learn' | 'test'

export interface VocabularyEntry {
  id: string
  english: string
  german: string
  createdAt: string
  updatedAt: string
}

export interface ExerciseSet {
  id: string
  name: string
  entries: VocabularyEntry[]
  createdAt: string
  updatedAt: string
}

export interface PracticePrompt {
  entryId: string
  source: string
  target: string
  targetLocale: SupportedLocale
}

export type SpokenOutcome =
  | 'correct'
  | 'different-word'
  | 'pronunciation-retry'
  | 'no-speech'
  | 'low-confidence'
  | 'service-unavailable'

export type SpellingOutcome = 'correct' | 'minor-typo' | 'incorrect'

export interface AttemptSummary {
  id: string
  exerciseId: string
  entryId: string
  mode: PracticeMode
  direction: Exclude<PracticeDirection, 'mixed'>
  spokenOutcome: SpokenOutcome
  spellingOutcome: SpellingOutcome
  attemptedAt: string
}
