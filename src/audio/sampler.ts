import { frequencyOf, fromMidi } from '../music-theory'
import type { InstrumentDefinition } from './instrument'
import { createVoiceBank } from './voice-bank'

interface ManifestSample {
  readonly midi: number
  readonly velocity: number
  readonly file: string
}

interface SampleManifest {
  readonly releaseSeconds: number
  readonly maxPolyphony: number
  readonly samples: readonly ManifestSample[]
}

export interface SampleLayer {
  readonly rootHertz: number
  readonly velocity: number
}

export function nearestSample<T extends SampleLayer>(samples: readonly T[], hertz: number, velocity: number): T {
  if (!Number.isFinite(hertz) || hertz <= 0 || !Number.isFinite(velocity)) throw new RangeError('Invalid sample note')
  let best: T | undefined
  let bestPitch = Infinity
  let bestVelocity = Infinity
  for (const sample of samples) {
    const pitchDistance = Math.abs(Math.log(hertz / sample.rootHertz))
    const velocityDistance = Math.abs(velocity - sample.velocity)
    if (pitchDistance < bestPitch - 1e-10 || (Math.abs(pitchDistance - bestPitch) < 1e-10 && velocityDistance < bestVelocity)) {
      best = sample
      bestPitch = pitchDistance
      bestVelocity = velocityDistance
    }
  }
  if (!best) throw new RangeError('No samples loaded')
  return best
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSample(value: unknown): value is ManifestSample {
  return isRecord(value)
    && typeof value.midi === 'number' && Number.isInteger(value.midi) && value.midi >= 0 && value.midi <= 127
    && typeof value.velocity === 'number' && value.velocity > 0 && value.velocity <= 1
    && typeof value.file === 'string' && /^[\w-]+\.mp3$/.test(value.file)
}

function parseManifest(value: unknown, instrumentId: string): SampleManifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.instrumentId !== instrumentId
    || typeof value.releaseSeconds !== 'number' || value.releaseSeconds < 0.01 || value.releaseSeconds > 2 || !Number.isFinite(value.releaseSeconds)
    || typeof value.maxPolyphony !== 'number' || !Number.isInteger(value.maxPolyphony) || value.maxPolyphony < 1 || value.maxPolyphony > 64
    || !Array.isArray(value.samples) || !value.samples.length || value.samples.length > 128 || !value.samples.every(isSample)) {
    throw new RangeError('Unsupported sample manifest')
  }
  return { releaseSeconds: value.releaseSeconds, maxPolyphony: value.maxPolyphony, samples: value.samples }
}

interface SamplerOptions {
  readonly id: string
  readonly label: string
  readonly creditsUrl?: string
  /** Same-origin path containing the versioned manifest and samples. */
  readonly baseUrl: string
  readonly fetchFile?: typeof fetch
}

export function sampleInstrument({ id, label, creditsUrl, baseUrl, fetchFile = fetch }: SamplerOptions): InstrumentDefinition {
  return {
    id, label, creditsUrl,
    create(context, output) {
      const cache = new Map<string, Promise<AudioBuffer>>()
      let bank: ReturnType<typeof createVoiceBank> | undefined

      async function fetchAsset(file: string, signal: AbortSignal) {
        const response = await fetchFile(baseUrl + file, { signal })
        if (!response.ok) throw new Error('Sample asset unavailable: ' + file)
        return response
      }

      function loadBuffer(file: string, signal: AbortSignal) {
        const cached = cache.get(file)
        if (cached) return cached
        const pending = (async () => {
          const encoded = await (await fetchAsset(file, signal)).arrayBuffer()
          const buffer = await context.decodeAudioData(encoded)
          signal.throwIfAborted()
          return buffer
        })()
        cache.set(file, pending)
        return pending
      }

      return {
        async load(signal, progress) {
          const manifest = parseManifest(await (await fetchAsset('manifest.json', signal)).json(), id)
          const samples = manifest.samples
          let nextIndex = 0
          let loaded = 0
          const decoded: (SampleLayer & { buffer: AudioBuffer })[] = []
          progress(0, samples.length)
          await Promise.all(Array.from({ length: Math.min(4, samples.length) }, async () => {
            while (nextIndex < samples.length) {
              signal.throwIfAborted()
              const index = nextIndex++
              const sample = samples[index]!
              const buffer = await loadBuffer(sample.file, signal)
              decoded[index] = { rootHertz: frequencyOf(fromMidi(sample.midi)), velocity: sample.velocity, buffer }
              progress(++loaded, samples.length)
            }
          }))
          signal.throwIfAborted()
          bank = createVoiceBank(context, output, {
            attack: 0.006, release: manifest.releaseSeconds, voiceGain: 0.82,
            maxPolyphony: manifest.maxPolyphony, steal: true,
            source({ hertz, velocity, start }) {
              const sample = nearestSample(decoded, hertz, velocity)
              const source = context.createBufferSource()
              source.buffer = sample.buffer
              source.playbackRate.setValueAtTime(hertz / sample.rootHertz, start)
              return source
            },
          })
        },
        noteOn: (note) => bank?.noteOn(note),
        noteOff: (voice) => bank?.noteOff(voice),
        releaseSource: (sourceId) => bank?.releaseSource(sourceId),
        allNotesOff: () => bank?.allNotesOff(),
        dispose() {
          bank?.dispose()
          bank = undefined
          cache.clear()
        },
      }
    },
  }
}
