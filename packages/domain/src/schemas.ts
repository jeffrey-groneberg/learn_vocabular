import { z } from 'zod'

export const localeSchema = z.enum(['en-GB', 'de-DE'])
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
})

export const pronunciationMetadataSchema = z.strictObject({
  reference: boundedPhraseSchema,
  locale: localeSchema,
  mode: practiceModeSchema,
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
  pronunciationScore: z.number().min(0).max(100).nullable(),
  recognizedText: z.string().max(120).optional(),
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
