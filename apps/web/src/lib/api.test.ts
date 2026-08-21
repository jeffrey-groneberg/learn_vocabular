import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDatabase, resetDatabaseForTests } from '../data/database.js'
import { requestSpeech } from './api.js'

afterEach(async () => {
  vi.unstubAllGlobals()
  const database = await getDatabase()
  database.close()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('vocabulary-voice-tutor')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  resetDatabaseForTests()
})

describe('speech API', () => {
  it('reuses generated speech from IndexedDB', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['generated-audio'], { type: 'audio/mpeg' }), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = await requestSpeech('apple', 'en-GB')
    const second = await requestSpeech('apple', 'en-GB')

    expect(await first.text()).toBe('generated-audio')
    expect(await second.text()).toBe('generated-audio')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
