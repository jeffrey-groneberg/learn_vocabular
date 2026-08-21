import type { PracticeWord, SpeechPace } from '@vocabulary/domain'

export type SpeechAudioLoader = (
  text: string,
  locale: PracticeWord['locale'],
  pace: SpeechPace,
) => Promise<Blob>

export function speechAudioKey(
  word: PracticeWord,
  pace: SpeechPace,
): string {
  return JSON.stringify([word.locale, pace, word.text.normalize('NFC')])
}

export class PreparedSpeechAudio {
  readonly #prepared = new Map<string, Blob>()
  readonly #pending = new Map<string, Promise<Blob>>()
  readonly #load: SpeechAudioLoader

  constructor(load: SpeechAudioLoader) {
    this.#load = load
  }

  prepare(word: PracticeWord, pace: SpeechPace): Promise<Blob> {
    const key = speechAudioKey(word, pace)
    const prepared = this.#prepared.get(key)
    if (prepared) {
      return Promise.resolve(prepared)
    }
    const pending = this.#pending.get(key)
    if (pending) {
      return pending
    }
    const request = this.#load(word.text, word.locale, pace)
      .then((blob) => {
        this.#prepared.set(key, blob)
        return blob
      })
      .finally(() => this.#pending.delete(key))
    this.#pending.set(key, request)
    return request
  }

  get(word: PracticeWord, pace: SpeechPace): Blob | undefined {
    return this.#prepared.get(speechAudioKey(word, pace))
  }

  clear(): void {
    this.#prepared.clear()
    this.#pending.clear()
  }
}

export function playPreparedSpeechBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      audio.onended = null
      audio.onerror = null
      URL.revokeObjectURL(url)
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }
    audio.onended = () => finish()
    audio.onerror = () => finish(new Error('Audio playback failed'))
    void audio.play().catch(() =>
      finish(new Error('Audio playback was blocked')),
    )
  })
}
