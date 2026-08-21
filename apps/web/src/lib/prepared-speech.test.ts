import type { PracticeWord } from '@vocabulary/domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  playPreparedSpeechBlob,
  PreparedSpeechAudio,
} from './prepared-speech.js'

const word: PracticeWord = {
  text: 'Good morning',
  language: 'english',
  locale: 'en-US',
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('prepared speech audio', () => {
  it('deduplicates pending loads and reuses the prepared blob', async () => {
    const blob = new Blob(['model'])
    let resolveLoad: ((value: Blob) => void) | undefined
    const load = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          resolveLoad = resolve
        }),
    )
    const prepared = new PreparedSpeechAudio(load)

    const first = prepared.prepare(word, 'slow')
    const second = prepared.prepare(word, 'slow')
    expect(load).toHaveBeenCalledOnce()

    resolveLoad?.(blob)
    await expect(first).resolves.toBe(blob)
    await expect(second).resolves.toBe(blob)
    await expect(prepared.prepare(word, 'slow')).resolves.toBe(blob)
    expect(load).toHaveBeenCalledOnce()
  })

  it('starts playback synchronously and releases its object URL when finished', async () => {
    class FakeAudio {
      static latest: FakeAudio | undefined
      onended: (() => void) | null = null
      onerror: (() => void) | null = null
      play = vi.fn().mockResolvedValue(undefined)

      constructor() {
        FakeAudio.latest = this
      }
    }
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:prepared')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.stubGlobal('Audio', FakeAudio)

    const playback = playPreparedSpeechBlob(new Blob(['model']))

    expect(FakeAudio.latest?.play).toHaveBeenCalledOnce()
    FakeAudio.latest?.onended?.()
    await expect(playback).resolves.toBeUndefined()
    expect(revoke).toHaveBeenCalledWith('blob:prepared')
  })
})
