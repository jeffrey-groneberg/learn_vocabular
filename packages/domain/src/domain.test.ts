import { describe, expect, it } from 'vitest'
import {
  createPracticePrompt,
  damerauLevenshtein,
  evaluatePronunciation,
  gradeSpelling,
  initialPracticeState,
  normalizeAnswer,
  practiceReducer,
} from './index.js'

describe('answer normalization', () => {
  it('normalizes case, whitespace, and composed Unicode without erasing German letters', () => {
    expect(normalizeAnswer('  GRU\u0308NE   Straße ', 'de-DE')).toBe('grüne straße')
    expect(normalizeAnswer('Straße', 'de-DE')).not.toBe(normalizeAnswer('Strasse', 'de-DE'))
  })
})

describe('spelling grading', () => {
  it('accepts one insertion, deletion, substitution, or transposition as a minor typo', () => {
    expect(damerauLevenshtein('house', 'hosue')).toBe(1)
    expect(gradeSpelling('Apfl', 'Apfel', 'de-DE').outcome).toBe('minor-typo')
    expect(gradeSpelling('Haus', 'house', 'en-GB').outcome).toBe('incorrect')
  })

  it('treats exact normalized spelling as correct', () => {
    expect(gradeSpelling('  APPLE ', 'apple', 'en-GB').outcome).toBe('correct')
  })
})

describe('pronunciation decisions', () => {
  it('requires both the expected word and a score of at least 80', () => {
    expect(evaluatePronunciation('apple', 'apple', 'en-GB', 80).outcome).toBe('correct')
    expect(evaluatePronunciation('  „Haus.“  ', 'haus', 'de-DE', 99).outcome).toBe('correct')
    expect(evaluatePronunciation('apple', 'apple', 'en-GB', 79.99).outcome).toBe(
      'pronunciation-retry',
    )
    expect(evaluatePronunciation('pear', 'apple', 'en-GB', 99).outcome).toBe(
      'different-word',
    )
  })
})

describe('practice state machine', () => {
  it('requires listening before recording and resets that gate for each word', () => {
    let state = initialPracticeState(2, 'test')
    expect(practiceReducer(state, { type: 'RECORD' })).toEqual(state)
    state = practiceReducer(state, { type: 'PLAY' })
    state = practiceReducer(state, { type: 'PLAY_FINISHED' })
    expect(state.hasListened).toBe(true)
    state = practiceReducer(state, { type: 'RECORD' })
    expect(state.phase).toBe('recording')
    state = practiceReducer(state, { type: 'RECORDED' })
    expect(state.phase).toBe('processing')
    state = practiceReducer(state, { type: 'SPEECH_FINISHED' })
    expect(state.phase).toBe('spelling')
    state = practiceReducer(state, { type: 'SPELLING_SUBMITTED' })
    state = practiceReducer(state, { type: 'PLAY' })
    expect(state.phase).toBe('playing')
    state = practiceReducer(state, { type: 'PLAY_FINISHED' })
    expect(state.phase).toBe('revealed')
    state = practiceReducer(state, { type: 'NEXT' })
    expect(state).toMatchObject({ phase: 'ready', itemIndex: 1, hasListened: false })
  })

  it('keeps a revealed answer visible when replay fails and is retried', () => {
    let state = initialPracticeState(1, 'learn')
    state = practiceReducer(state, { type: 'PLAY' })
    state = practiceReducer(state, { type: 'PLAY_FINISHED' })
    state = practiceReducer(state, { type: 'RECORD' })
    state = practiceReducer(state, { type: 'RECORDED' })
    state = practiceReducer(state, { type: 'SPEECH_FINISHED' })
    state = practiceReducer(state, { type: 'SPELLING_SUBMITTED' })
    state = practiceReducer(state, { type: 'PLAY' })
    state = practiceReducer(state, { type: 'FAIL', message: 'Playback failed' })
    expect(state).toMatchObject({ phase: 'revealed', error: 'Playback failed' })
    expect(practiceReducer(state, { type: 'RETRY' })).toMatchObject({
      phase: 'revealed',
      error: null,
    })
  })

  it('ignores overlapping actions', () => {
    let ready = practiceReducer(initialPracticeState(2, 'learn'), { type: 'PLAY' })
    ready = practiceReducer(ready, { type: 'PLAY_FINISHED' })
    const recording = practiceReducer(ready, { type: 'RECORD' })
    expect(practiceReducer(recording, { type: 'PLAY' })).toEqual(recording)
  })
})

describe('English-first prompts', () => {
  const entry = {
    id: 'entry-1',
    english: 'house',
    german: 'Haus',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  it('uses English audio and asks for German then English in English-to-German', () => {
    const prompt = createPracticePrompt(entry, 'english-to-german')
    expect(prompt.cueLanguage).toBe('english')
    expect(prompt.spokenLanguage).toBe('english')
    expect(prompt.spellingLanguages).toEqual(['german', 'english'])
  })

  it('uses German audio but still assesses and spells English in German-to-English', () => {
    const prompt = createPracticePrompt(entry, 'german-to-english')
    expect(prompt.cueLanguage).toBe('german')
    expect(prompt.spokenLanguage).toBe('english')
    expect(prompt.spellingLanguages).toEqual(['english'])
  })
})
