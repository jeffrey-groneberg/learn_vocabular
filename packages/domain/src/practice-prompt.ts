import type {
  PracticeDirection,
  PracticePrompt,
  PracticeWord,
  VocabularyEntry,
} from './types.js'

export function createPracticePrompt(
  entry: VocabularyEntry,
  direction: Exclude<PracticeDirection, 'mixed'>,
): PracticePrompt {
  const english: PracticeWord = {
    language: 'english',
    text: entry.english,
    locale: 'en-US',
  }
  const german: PracticeWord = {
    language: 'german',
    text: entry.german,
    locale: 'de-DE',
  }

  return {
    entryId: entry.id,
    direction,
    words: { english, german },
    cueLanguage: direction === 'english-to-german' ? 'english' : 'german',
    spokenLanguage: 'english',
    spellingLanguages:
      direction === 'english-to-german' ? ['german', 'english'] : ['english'],
  }
}
