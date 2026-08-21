export interface ParsedPcmWav {
  pcm: ArrayBuffer
  durationMs: number
}

export function parsePcmWav(audio: Buffer): ParsedPcmWav {
  if (
    audio.byteLength < 44 ||
    audio.toString('ascii', 0, 4) !== 'RIFF' ||
    audio.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('Unsupported WAV container')
  }

  let offset = 12
  let formatFound = false
  let data: Buffer | undefined

  while (offset + 8 <= audio.byteLength) {
    const chunkName = audio.toString('ascii', offset, offset + 4)
    const chunkLength = audio.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkLength
    if (chunkEnd > audio.byteLength) {
      throw new Error('Invalid WAV chunk length')
    }

    if (chunkName === 'fmt ') {
      if (
        chunkLength < 16 ||
        audio.readUInt16LE(chunkStart) !== 1 ||
        audio.readUInt16LE(chunkStart + 2) !== 1 ||
        audio.readUInt32LE(chunkStart + 4) !== 16_000 ||
        audio.readUInt16LE(chunkStart + 14) !== 16
      ) {
        throw new Error('WAV must be mono 16 kHz 16-bit PCM')
      }
      formatFound = true
    } else if (chunkName === 'data') {
      data = audio.subarray(chunkStart, chunkEnd)
    }

    offset = chunkEnd + (chunkLength % 2)
  }

  if (!formatFound || !data || data.byteLength === 0 || data.byteLength % 2 !== 0) {
    throw new Error('WAV is missing valid PCM audio')
  }

  const pcm = new Uint8Array(data.byteLength)
  pcm.set(data)
  return {
    pcm: pcm.buffer,
    durationMs: (data.byteLength / (16_000 * 2)) * 1_000,
  }
}
