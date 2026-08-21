import { describe, expect, it } from 'vitest'
import { parsePronunciationAssessmentJson } from './speech.js'

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
              PronScore: 86,
            },
            Words: [
              {
                PronunciationAssessment: {
                  AccuracyScore: 82,
                  ErrorType: 'Mispronunciation',
                },
                Phonemes: [
                  { PronunciationAssessment: { AccuracyScore: 91 } },
                  { PronunciationAssessment: { AccuracyScore: 72 } },
                  { PronunciationAssessment: { AccuracyScore: 89 } },
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
        minimumWord: 82,
        minimumPhoneme: 72,
      },
      errors: ['mispronunciation'],
      weakestSoundPosition: 'middle',
    })
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
                PronScore: 80,
              },
            },
          ],
        }),
      ),
    ).toThrow('Pronunciation assessment omitted required scoring details')
  })
})
