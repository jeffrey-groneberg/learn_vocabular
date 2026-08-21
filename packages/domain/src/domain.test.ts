import { describe, expect, it } from 'vitest'
import {
  damerauLevenshtein,
  evaluatePronunciation,
  gradeSpelling,
  initialPracticeState,
  mayRevealTarget,
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
    expect(evaluatePronunciation('apple', 'apple', 'en-GB', 79.99).outcome).toBe(
      'pronunciation-retry',
    )
    expect(evaluatePronunciation('pear', 'apple', 'en-GB', 99).outcome).toBe(
      'different-word',
    )
  })
})

describe('practice state machine', () => {
  it('serializes recording, processing, spelling, reveal, and completion', () => {
    let state = initialPracticeState(1, 'test')
    state = practiceReducer(state, { type: 'RECORD' })
    expect(state.phase).toBe('recording')
    state = practiceReducer(state, { type: 'RECORDED' })
    expect(state.phase).toBe('processing')
    state = practiceReducer(state, { type: 'SPEECH_FINISHED' })
    expect(state.phase).toBe('spelling')
    expect(mayRevealTarget('test', state.phase)).toBe(false)
    state = practiceReducer(state, { type: 'SPELLING_SUBMITTED' })
    expect(mayRevealTarget('test', state.phase)).toBe(true)
    state = practiceReducer(state, { type: 'NEXT' })
    expect(state.phase).toBe('complete')
  })

  it('ignores overlapping actions', () => {
    const recording = practiceReducer(initialPracticeState(2, 'learn'), { type: 'RECORD' })
    expect(practiceReducer(recording, { type: 'PLAY' })).toEqual(recording)
  })
})
