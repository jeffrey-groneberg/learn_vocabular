const targetSampleRate = 16_000
const maximumAttemptMs = 15_000
const microphoneWarmupMs = 500

function downsample(samples: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === targetSampleRate) {
    return samples
  }

  const ratio = sourceRate / targetSampleRate
  const outputLength = Math.round(samples.length / ratio)
  const output = new Float32Array(outputLength)

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.round(outputIndex * ratio)
    const end = Math.min(Math.round((outputIndex + 1) * ratio), samples.length)
    let sum = 0
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += samples[inputIndex] ?? 0
    }
    output[outputIndex] = end > start ? sum / (end - start) : 0
  }

  return output
}

function encodeWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, targetSampleRate, true)
  view.setUint32(28, targetSampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (const sample of samples) {
    const clipped = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export class PcmRecorder {
  private readonly chunks: Float32Array[] = []
  private readonly stream: MediaStream
  private readonly context: AudioContext
  private readonly source: MediaStreamAudioSourceNode
  private readonly processor: ScriptProcessorNode
  private readonly ready: Promise<void>
  private resolveReady: (() => void) | undefined
  private startedAt = 0
  private stopped = false

  private constructor(
    stream: MediaStream,
    context: AudioContext,
    source: MediaStreamAudioSourceNode,
    processor: ScriptProcessorNode,
  ) {
    this.stream = stream
    this.context = context
    this.source = source
    this.processor = processor
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve
    })
    processor.onaudioprocess = (event) => {
      if (!this.stopped) {
        this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
        this.resolveReady?.()
        this.resolveReady = undefined
      }
    }
  }

  static async start(): Promise<PcmRecorder> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone recording is not supported by this browser.')
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const processor = context.createScriptProcessor(4096, 1, 1)
    source.connect(processor)
    processor.connect(context.destination)
    const recorder = new PcmRecorder(stream, context, source, processor)
    await context.resume()
    try {
      await Promise.race([
        recorder.ready,
        new Promise<never>((_resolve, reject) => {
          window.setTimeout(
            () => reject(new Error('The microphone audio pipeline did not start.')),
            2_000,
          )
        }),
      ])
    } catch (error) {
      await recorder.dispose()
      throw error
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, microphoneWarmupMs)
    })
    recorder.chunks.length = 0
    recorder.startedAt = performance.now()
    return recorder
  }

  get remainingMs(): number {
    return Math.max(0, maximumAttemptMs - (performance.now() - this.startedAt))
  }

  async stop(): Promise<Blob> {
    if (this.stopped) {
      throw new Error('This recording has already stopped.')
    }
    this.stopped = true
    await this.dispose()

    const length = this.chunks.reduce((total, chunk) => total + chunk.length, 0)
    if (length === 0) {
      throw new Error('No microphone audio was captured.')
    }
    const samples = new Float32Array(length)
    let offset = 0
    for (const chunk of this.chunks) {
      samples.set(chunk, offset)
      offset += chunk.length
    }
    return encodeWav(downsample(samples, this.context.sampleRate))
  }

  private async dispose(): Promise<void> {
    this.processor.disconnect()
    this.source.disconnect()
    this.stream.getTracks().forEach((track) => track.stop())
    if (this.context.state !== 'closed') {
      await this.context.close()
    }
  }
}
