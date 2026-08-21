import 'fake-indexeddb/auto'
import type { ExerciseSet } from '@vocabulary/domain'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteExercise,
  getCachedSpeechAudio,
  getDatabase,
  listExercises,
  resetDatabaseForTests,
  saveAttempt,
  saveCachedSpeechAudio,
  saveExercise,
  speechAudioCacheEntryLimit,
} from './database.js'

afterEach(async () => {
  const database = await getDatabase()
  database.close()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('vocabulary-voice-tutor')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  resetDatabaseForTests()
})

describe('local vocabulary database', () => {
  it('stores exercises and removes their attempt history together', async () => {
    const exercise: ExerciseSet = {
      id: 'set-1',
      name: 'Week one',
      entries: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await saveExercise(exercise)
    await saveAttempt({
      id: 'attempt-1',
      exerciseId: exercise.id,
      entryId: 'entry-1',
      mode: 'learn',
      direction: 'english-to-german',
      spokenOutcome: 'correct',
      spellingOutcome: 'correct',
      germanSpellingOutcome: 'correct',
      completion: 'first-try',
      retryCount: 0,
      attemptedAt: '2026-01-01T00:01:00.000Z',
    })

    expect(await listExercises()).toEqual([exercise])
    await deleteExercise(exercise.id)
    expect(await listExercises()).toEqual([])
    expect(await (await getDatabase()).getAll('attempts')).toEqual([])
  })

  it('caches generated speech by normalized text and locale', async () => {
    const audio = new Blob(['generated-audio'], { type: 'audio/mpeg' })
    await saveCachedSpeechAudio('Cafe\u0301', 'de-DE', audio)

    const cached = await getCachedSpeechAudio('Café', 'de-DE')
    expect(await cached?.text()).toBe('generated-audio')
    expect(await getCachedSpeechAudio('Café', 'en-GB')).toBeUndefined()
  })

  it('bounds the generated speech cache', async () => {
    for (let index = 0; index <= speechAudioCacheEntryLimit; index += 1) {
      await saveCachedSpeechAudio(
        `word-${index}`,
        'en-GB',
        new Blob([String(index)], { type: 'audio/mpeg' }),
      )
    }

    const database = await getDatabase()
    expect(await database.count('speechAudio')).toBe(speechAudioCacheEntryLimit)
    expect(
      await (await getCachedSpeechAudio(`word-${speechAudioCacheEntryLimit}`, 'en-GB'))?.text(),
    ).toBe(String(speechAudioCacheEntryLimit))
  })
})
