import 'fake-indexeddb/auto'
import type { ExerciseSet } from '@vocabulary/domain'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteExercise,
  getDatabase,
  getPreference,
  listExercises,
  resetDatabaseForTests,
  saveAttempt,
  saveExercise,
  savePreference,
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

  it('persists preferences independently from exercise data', async () => {
    expect(await getPreference('ui-language')).toBeUndefined()

    await savePreference('ui-language', 'de')
    expect(await getPreference('ui-language')).toBe('de')

    await savePreference('ui-language', 'en')
    expect(await getPreference('ui-language')).toBe('en')
  })

  it('opens an existing version-two database without losing learner data', async () => {
    const exercise: ExerciseSet = {
      id: 'set-existing',
      name: 'Existing words',
      entries: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('vocabulary-voice-tutor', 2)
      request.onupgradeneeded = () => {
        const database = request.result
        const exercises = database.createObjectStore('exercises', { keyPath: 'id' })
        exercises.createIndex('by-updated', 'updatedAt')
        const attempts = database.createObjectStore('attempts', { keyPath: 'id' })
        attempts.createIndex('by-exercise', 'exerciseId')
        attempts.createIndex('by-attempted', 'attemptedAt')
        database.createObjectStore('preferences', { keyPath: 'key' })
        const speechAudio = database.createObjectStore('speechAudio', { keyPath: 'key' })
        speechAudio.createIndex('by-last-accessed', 'lastAccessedAt')
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('exercises', 'readwrite')
        transaction.objectStore('exercises').put(exercise)
        transaction.onerror = () => reject(transaction.error)
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
      }
    })
    resetDatabaseForTests()

    expect(await listExercises()).toEqual([exercise])
    await savePreference('ui-language', 'de')
    expect(await getPreference('ui-language')).toBe('de')
  })
})
