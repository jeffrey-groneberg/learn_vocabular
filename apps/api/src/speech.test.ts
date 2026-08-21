import { describe, expect, it } from 'vitest'
import {
  createPronunciationAssessmentConfig,
  createSpeechSsml,
  parsePronunciationAssessmentJson,
} from './speech.js'

describe('speech synthesis', () => {
  it('creates distinct escaped SSML for normal and slow playback', () => {
    const normal = createSpeechSsml('fish & chips', 'en-US', 'normal')
    const slow = createSpeechSsml('fish & chips', 'en-US', 'slow')

    expect(normal).toContain('<prosody rate="-8%">fish &amp; chips</prosody>')
    expect(slow).toContain('<prosody rate="-28%">fish &amp; chips</prosody>')
  })

  it('requests IPA alternatives and prosody for sentence assessment', () => {
    expect(JSON.parse(createPronunciationAssessmentConfig('The dog runs.').toJSON())).toMatchObject({
      referenceText: 'The dog runs.',
      phonemeAlphabet: 'IPA',
      nbestPhonemeCount: 5,
      enableProsodyAssessment: true,
      enableMiscue: true,
    })
  })
})

describe('pronunciation assessment details', () => {
  it('extracts aggregate, word, and phoneme evidence', () => {
    const evidence = parsePronunciationAssessmentJson(
      JSON.stringify({
        NBest: [
          {
            PronunciationAssessment: {
              AccuracyScore: 88,
              FluencyScore: 83,
              CompletenessScore: 100,
              ProsodyScore: 84,
              PronScore: 86,
            },
            Words: [
              {
                Word: 'the',
                PronunciationAssessment: {
                  AccuracyScore: 91,
                  ErrorType: 'None',
                },
                Phonemes: [
                  {
                    Phoneme: 'ð',
                    PronunciationAssessment: {
                      AccuracyScore: 91,
                      NBestPhonemes: [{ Phoneme: 'ð', Score: 100 }],
                    },
                  },
                ],
              },
              {
                Word: 'dog',
                PronunciationAssessment: {
                  AccuracyScore: 72,
                  ErrorType: 'Mispronunciation',
                },
                Phonemes: [
                  {
                    Phoneme: 'd',
                    PronunciationAssessment: {
                      AccuracyScore: 92,
                      NBestPhonemes: [{ Phoneme: 'd', Score: 100 }],
                    },
                  },
                  {
                    Phoneme: 'ɔ',
                    PronunciationAssessment: {
                      AccuracyScore: 74,
                      NBestPhonemes: [
                        { Phoneme: 'ɑ', Score: 88 },
                        { Phoneme: 'ɔ', Score: 74 },
                      ],
                    },
                  },
                  {
                    Phoneme: 'ɡ',
                    PronunciationAssessment: {
                      AccuracyScore: 89,
                      NBestPhonemes: [{ Phoneme: 'ɡ', Score: 100 }],
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    )

    expect(evidence).toEqual({
      scores: {
        overall: 86,
        accuracy: 88,
        fluency: 83,
        completeness: 100,
        prosody: 84,
        minimumWord: 72,
        minimumPhoneme: 74,
      },
      errors: ['mispronunciation'],
      problemWords: [
        {
          word: 'dog',
          index: 1,
          accuracyScore: 72,
          errors: ['mispronunciation'],
          weakestSound: {
            expected: 'ɔ',
            heard: 'ɑ',
            score: 74,
            position: 'middle',
          },
        },
      ],
    })
  })

  it('extracts sentence break confidence and utterance-level monotone feedback', () => {
    const evidence = parsePronunciationAssessmentJson(
      JSON.stringify({
        NBest: [
          {
            PronunciationAssessment: {
              AccuracyScore: 94,
              FluencyScore: 92,
              CompletenessScore: 100,
              ProsodyScore: 78,
              PronScore: 88,
            },
            Words: [
              {
                Word: 'morning',
                PronunciationAssessment: {
                  AccuracyScore: 94,
                  ErrorType: 'None',
                },
                Feedback: {
                  Prosody: {
                    Break: {
                      ErrorTypes: ['None'],
                      UnexpectedBreak: { Confidence: 0.9 },
                      MissingBreak: { Confidence: 0.2 },
                    },
                    Intonation: {
                      ErrorTypes: ['Monotone'],
                    },
                  },
                },
                Phonemes: [
                  {
                    Phoneme: 'm',
                    PronunciationAssessment: {
                      AccuracyScore: 94,
                      NBestPhonemes: [{ Phoneme: 'm', Score: 100 }],
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    )

    expect(evidence.errors).toEqual(['unexpected-break', 'monotone'])
    expect(evidence.problemWords).toEqual([
      {
        word: 'morning',
        index: 0,
        accuracyScore: 94,
        errors: ['unexpected-break'],
      },
    ])
  })

  it('rejects results that omit required word or phoneme evidence', () => {
    expect(() =>
      parsePronunciationAssessmentJson(
        JSON.stringify({
          NBest: [
            {
              PronunciationAssessment: {
                AccuracyScore: 80,
                FluencyScore: 80,
                CompletenessScore: 80,
                ProsodyScore: 80,
                PronScore: 80,
              },
            },
          ],
        }),
      ),
    ).toThrow('Pronunciation assessment omitted required scoring details')
  })
})
