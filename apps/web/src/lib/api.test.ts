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
  it('reuses normal and slow generated speech from separate cache entries', async () => {
    const fetchMock = vi.fn().mockImplementation((_input, init: RequestInit | undefined) => {
      const request = JSON.parse(String(init?.body)) as { pace: string }
      return Promise.resolve(
        new Response(new Blob([`${request.pace}-audio`], { type: 'audio/mpeg' }), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = await requestSpeech('apple', 'en-US')
    const second = await requestSpeech('apple', 'en-US')
    const slowFirst = await requestSpeech('apple', 'en-US', 'slow')
    const slowSecond = await requestSpeech('apple', 'en-US', 'slow')

    expect(await first.text()).toBe('normal-audio')
    expect(await second.text()).toBe('normal-audio')
    expect(await slowFirst.text()).toBe('slow-audio')
    expect(await slowSecond.text()).toBe('slow-audio')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
