import { z } from 'zod'
import {
  pronunciationChecks,
  pronunciationErrors,
  pronunciationSoundPositions,
  speechPaces,
} from './types.js'

export const localeSchema = z.enum(['en-US', 'de-DE'])
export const practiceModeSchema = z.enum(['learn', 'test'])

const boundedPhraseSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (value) =>
      [...value].every((character) => {
        const codePoint = character.codePointAt(0) ?? 0
        return codePoint > 31 && codePoint !== 127
      }),
    'Control characters are not allowed',
  )

export const ttsRequestSchema = z.strictObject({
  text: boundedPhraseSchema,
  locale: localeSchema,
  pace: z.enum(speechPaces).default('normal'),
})

export const pronunciationMetadataSchema = z.strictObject({
  reference: boundedPhraseSchema,
  locale: localeSchema,
  mode: practiceModeSchema,
})

const pronunciationScoreSchema = z.number().min(0).max(100)

export const pronunciationScoresSchema = z.strictObject({
  overall: pronunciationScoreSchema,
  accuracy: pronunciationScoreSchema,
  fluency: pronunciationScoreSchema,
  completeness: pronunciationScoreSchema,
  prosody: pronunciationScoreSchema.nullable(),
  minimumWord: pronunciationScoreSchema,
  minimumPhoneme: pronunciationScoreSchema.nullable(),
})

const pronunciationSoundFeedbackSchema = z.strictObject({
  expected: z.string().min(1).max(20),
  heard: z.string().min(1).max(20).optional(),
  score: pronunciationScoreSchema,
  position: z.enum(pronunciationSoundPositions).optional(),
})

const pronunciationWordFeedbackSchema = z.strictObject({
  word: z.string().min(1).max(120),
  index: z.number().int().nonnegative(),
  accuracyScore: pronunciationScoreSchema,
  errors: z.array(z.enum(pronunciationErrors)).max(pronunciationErrors.length),
  weakestSound: pronunciationSoundFeedbackSchema.optional(),
})

export const pronunciationResponseSchema = z.strictObject({
  outcome: z.enum([
    'correct',
    'different-word',
    'pronunciation-retry',
    'no-speech',
    'low-confidence',
    'service-unavailable',
  ]),
  pronunciationScore: pronunciationScoreSchema.nullable(),
  scores: pronunciationScoresSchema.nullable(),
  failedChecks: z.array(z.enum(pronunciationChecks)),
  errors: z.array(z.enum(pronunciationErrors)),
  problemWords: z.array(pronunciationWordFeedbackSchema).max(120),
  recognizedText: z.string().max(1000).optional(),
})

export const sessionRequestSchema = z.strictObject({
  code: z.string().min(1).max(256),
})

export const exerciseEntrySchema = z.strictObject({
  id: z.string().min(1).max(80),
  english: boundedPhraseSchema,
  german: boundedPhraseSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const exerciseSetSchema = z.strictObject({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  entries: z.array(exerciseEntrySchema).max(200),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const apiErrorSchema = z.strictObject({
  error: z.enum([
    'invalid-request',
    'not-authenticated',
    'blocked',
    'unsupported-audio',
    'payload-too-large',
    'speech-unavailable',
    'internal-error',
  ]),
  retryAfterSeconds: z.number().int().positive().optional(),
})
