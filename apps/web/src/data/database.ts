import type { AttemptSummary, ExerciseSet } from '@vocabulary/domain'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

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
}

let databasePromise: Promise<IDBPDatabase<VocabularyDatabase>> | undefined

export function getDatabase(): Promise<IDBPDatabase<VocabularyDatabase>> {
  databasePromise ??= openDB<VocabularyDatabase>('vocabulary-voice-tutor', 1, {
    upgrade(database) {
      const exercises = database.createObjectStore('exercises', { keyPath: 'id' })
      exercises.createIndex('by-updated', 'updatedAt')

      const attempts = database.createObjectStore('attempts', { keyPath: 'id' })
      attempts.createIndex('by-exercise', 'exerciseId')
      attempts.createIndex('by-attempted', 'attemptedAt')

      database.createObjectStore('preferences', { keyPath: 'key' })
    },
  })

  return databasePromise
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
