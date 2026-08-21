import type {
  AttemptSummary,
  ExerciseSet,
  SpeechPace,
  SupportedLocale,
} from '@vocabulary/domain'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

interface CachedSpeechAudio {
  key: string
  audio: Blob
  lastAccessedAt: number
}

interface VocabularyDatabase extends DBSchema {
  exercises: {
    key: string
    value: ExerciseSet
    indexes: { 'by-updated': string }
  }
  attempts: {
    key: string
    value: AttemptSummary
    indexes: {
      'by-exercise': string
      'by-attempted': string
    }
  }
  preferences: {
    key: string
    value: {
      key: string
      value: string
    }
  }
  speechAudio: {
    key: string
    value: CachedSpeechAudio
    indexes: { 'by-last-accessed': number }
  }
}

export const speechAudioCacheEntryLimit = 256

let databasePromise: Promise<IDBPDatabase<VocabularyDatabase>> | undefined

export function getDatabase(): Promise<IDBPDatabase<VocabularyDatabase>> {
  databasePromise ??= openDB<VocabularyDatabase>('vocabulary-voice-tutor', 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const exercises = database.createObjectStore('exercises', { keyPath: 'id' })
        exercises.createIndex('by-updated', 'updatedAt')

        const attempts = database.createObjectStore('attempts', { keyPath: 'id' })
        attempts.createIndex('by-exercise', 'exerciseId')
        attempts.createIndex('by-attempted', 'attemptedAt')

        database.createObjectStore('preferences', { keyPath: 'key' })
      }

      if (oldVersion < 2) {
        const speechAudio = database.createObjectStore('speechAudio', { keyPath: 'key' })
        speechAudio.createIndex('by-last-accessed', 'lastAccessedAt')
      }
    },
  })

  return databasePromise
}

// Bump this when the server-side voice, speaking rate, or audio format changes.
const speechSynthesisRevision = 'v2'

function speechAudioKey(text: string, locale: SupportedLocale, pace: SpeechPace): string {
  return JSON.stringify([speechSynthesisRevision, locale, pace, text.normalize('NFC')])
}

export async function getCachedSpeechAudio(
  text: string,
  locale: SupportedLocale,
  pace: SpeechPace = 'normal',
): Promise<Blob | undefined> {
  const database = await getDatabase()
  const transaction = database.transaction('speechAudio', 'readwrite')
  const store = transaction.objectStore('speechAudio')
  const key = speechAudioKey(text, locale, pace)
  const cached = await store.get(key)

  if (!cached) {
    await transaction.done
    return undefined
  }

  if (cached.audio.size === 0 || !cached.audio.type.startsWith('audio/')) {
    await store.delete(key)
    await transaction.done
    return undefined
  }

  await store.put({ ...cached, lastAccessedAt: Date.now() })
  await transaction.done
  return cached.audio
}

export async function saveCachedSpeechAudio(
  text: string,
  locale: SupportedLocale,
  audio: Blob,
  pace: SpeechPace = 'normal',
): Promise<void> {
  if (audio.size === 0 || !audio.type.startsWith('audio/')) {
    throw new TypeError('Cached speech must be a non-empty audio blob')
  }

  const database = await getDatabase()
  const transaction = database.transaction('speechAudio', 'readwrite')
  const store = transaction.objectStore('speechAudio')
  const key = speechAudioKey(text, locale, pace)
  await store.put({ key, audio, lastAccessedAt: Date.now() })

  let entriesToRemove = (await store.count()) - speechAudioCacheEntryLimit
  let cursor = await store.index('by-last-accessed').openCursor()
  while (cursor && entriesToRemove > 0) {
    if (cursor.primaryKey !== key) {
      await cursor.delete()
      entriesToRemove -= 1
    }
    cursor = await cursor.continue()
  }

  await transaction.done
}

export async function listExercises(): Promise<ExerciseSet[]> {
  const database = await getDatabase()
  return (await database.getAll('exercises')).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )
}

export async function saveExercise(exercise: ExerciseSet): Promise<void> {
  const database = await getDatabase()
  await database.put('exercises', exercise)
}

export async function deleteExercise(id: string): Promise<void> {
  const database = await getDatabase()
  const transaction = database.transaction(['exercises', 'attempts'], 'readwrite')
  await transaction.objectStore('exercises').delete(id)

  const attempts = await transaction.objectStore('attempts').index('by-exercise').getAllKeys(id)
  await Promise.all(attempts.map((attemptId) => transaction.objectStore('attempts').delete(attemptId)))
  await transaction.done
}

export async function saveAttempt(attempt: AttemptSummary): Promise<void> {
  const database = await getDatabase()
  await database.put('attempts', attempt)
}

export function resetDatabaseForTests(): void {
  databasePromise = undefined
}
