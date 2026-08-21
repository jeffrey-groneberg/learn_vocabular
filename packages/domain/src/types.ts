export const supportedLocales = ['en-GB', 'de-DE'] as const

export type SupportedLocale = (typeof supportedLocales)[number]
export type PracticeDirection = 'english-to-german' | 'german-to-english' | 'mixed'
export type PracticeMode = 'learn' | 'test'
export type VocabularyLanguage = 'english' | 'german'

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
  direction: Exclude<PracticeDirection, 'mixed'>
  words: Record<VocabularyLanguage, PracticeWord>
  cueLanguage: VocabularyLanguage
  spokenLanguage: 'english'
  spellingLanguages: readonly VocabularyLanguage[]
}

export interface PracticeWord {
  language: VocabularyLanguage
  text: string
  locale: SupportedLocale
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
  /** English spelling is the primary written outcome in every direction. */
  spellingOutcome: SpellingOutcome
  germanSpellingOutcome?: SpellingOutcome
  attemptedAt: string
}
