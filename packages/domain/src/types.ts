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

export const pronunciationChecks = [
  'overall',
  'accuracy',
  'fluency',
  'completeness',
  'minimumWord',
  'minimumPhoneme',
] as const
export type PronunciationCheck = (typeof pronunciationChecks)[number]

export const pronunciationErrors = [
  'omission',
  'insertion',
  'mispronunciation',
  'unexpected-break',
  'missing-break',
  'monotone',
] as const
export type PronunciationError = (typeof pronunciationErrors)[number]

export const pronunciationSoundPositions = ['start', 'middle', 'end'] as const
export type PronunciationSoundPosition = (typeof pronunciationSoundPositions)[number]

export interface PronunciationScores {
  overall: number
  accuracy: number
  fluency: number
  completeness: number
  minimumWord: number
  minimumPhoneme: number
}

export interface PronunciationEvidence {
  scores: PronunciationScores
  errors: PronunciationError[]
  weakestSoundPosition?: PronunciationSoundPosition
}

export interface PronunciationFeedback {
  scores: PronunciationScores | null
  failedChecks: PronunciationCheck[]
  errors: PronunciationError[]
  weakestSoundPosition?: PronunciationSoundPosition
}

export type SpellingOutcome = 'correct' | 'minor-typo' | 'incorrect'
export type AttemptCompletion = 'first-try' | 'retried' | 'skipped'
export type SkippedPracticeStep = 'speaking' | 'spelling'

export interface AttemptSummary {
  id: string
  exerciseId: string
  entryId: string
  mode: PracticeMode
  direction: Exclude<PracticeDirection, 'mixed'>
  spokenOutcome?: SpokenOutcome
  /** English spelling is the primary written outcome in every direction. */
  spellingOutcome?: SpellingOutcome
  germanSpellingOutcome?: SpellingOutcome
  completion: AttemptCompletion
  retryCount: number
  skippedAt?: SkippedPracticeStep
  attemptedAt: string
}
