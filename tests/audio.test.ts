import { describe, expect, it, vi } from 'vitest'
import { createAudioEngine, sampleInstrument } from '../src/audio'
import { fromMidi } from '../src/music-theory'
import { createNoteInputManager } from '../src/note-input'
import type { NoteOn, NoteOff } from '../src/note-input'
import { createMidiInput } from '../src/midi'

function param() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  }
}

function gainNode() {
  return { gain: param(), connect: vi.fn(), disconnect: vi.fn() }
}

function oscillatorNode() {
  const start = vi.fn()
  return {
    frequency: param(), start, connect: vi.fn(), disconnect: vi.fn(),
    stop: vi.fn<(time: number) => void>(() => { if (!start.mock.calls.length) throw new Error('Oscillator not started') }),
    onended: null as (() => void) | null,
  }
}

function audioHarness(resumeGate: Promise<void> = Promise.resolve(), options?: Parameters<typeof createAudioEngine>[1]) {
  const buffers: (ReturnType<typeof oscillatorNode> & { buffer: AudioBuffer | null; playbackRate: ReturnType<typeof param> })[] = []
  const oscillators: ReturnType<typeof oscillatorNode>[] = []
  const gains: ReturnType<typeof gainNode>[] = []
  const analyser = () => ({ fftSize: 0, getFloatTimeDomainData: vi.fn((samples: Float32Array) => samples.fill(0)), disconnect: vi.fn() })
  const analysers: ReturnType<typeof analyser>[] = []
  const splitter = { connect: vi.fn(), disconnect: vi.fn() }
  const shaper = { curve: null as Float32Array | null, connect: vi.fn(), disconnect: vi.fn() }
  const context = {
    state: 'suspended',
    currentTime: 10,
    destination: {},
    createOscillator: vi.fn(() => {
      const oscillator = oscillatorNode()
      oscillators.push(oscillator)
      return oscillator
    }),
    createBufferSource: vi.fn(() => {
      const source = { ...oscillatorNode(), buffer: null, playbackRate: param() }
      buffers.push(source)
      return source
    }),
    decodeAudioData: vi.fn(async (data: ArrayBuffer) => ({ marker: new Uint8Array(data)[0] }) as unknown as AudioBuffer),
    createGain: vi.fn(() => {
      const node = gainNode()
      gains.push(node)
      return node
    }),
    createWaveShaper: vi.fn(() => shaper),
    createDynamicsCompressor: vi.fn(() => ({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: vi.fn(), disconnect: vi.fn() })),
    createChannelSplitter: vi.fn(() => splitter),
    createAnalyser: vi.fn(() => {
      const node = analyser()
      analysers.push(node)
      return node
    }),
    resume: vi.fn(async () => { await resumeGate; context.state = 'running' }),
    close: vi.fn(async () => { context.state = 'closed' }),
  }
  const factory = vi.fn(() => context as unknown as AudioContext)
  return { engine: createAudioEngine(factory, options), context, factory, oscillators, buffers, gains, analysers, splitter, shaper }
}

const note = (sourceId = 'piano', pressId = 'pointer', midi = 69): NoteOn => ({
  type: 'note-on', sourceId, pressId, pitch: fromMidi(midi), velocity: 1,
})
const off = ({ sourceId, pressId }: NoteOn): NoteOff => ({ type: 'note-off', sourceId, pressId })

describe('shared Web Audio engine', () => {
  it('creates audio lazily, tracks settings and ramps master mute and volume', async () => {
    const { engine, factory, gains, context } = audioHarness()
    const listener = vi.fn()
    const unsubscribe = engine.subscribe(listener)
    engine.setSettings({ volume: 1.5 })
    expect(factory).not.toHaveBeenCalled()
    await engine.resume()
    await engine.resume()
    expect(factory).toHaveBeenCalledTimes(1)
    expect(context.resume).toHaveBeenCalledTimes(1)
    expect(gains[0]?.gain.value).toBe(1)
    engine.setSettings({ muted: true })
    expect(gains[0]?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.015)
    engine.setSettings({ volume: 0.5 })
    engine.setSettings({ muted: false })
    expect(gains[0]?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.5 ** 1.5, 10, 0.015)
    expect(engine.getSettings()).toEqual({ volume: 0.5, muted: false })
    expect(listener).toHaveBeenCalledTimes(4)
    unsubscribe()
    engine.setSettings({ muted: true })
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it('plays independent voices for the same pitch and cleans up released nodes', async () => {
    const { engine, oscillators, gains } = audioHarness()
    const first = note()
    const second = note('midi', 'pointer')
    await Promise.all([engine.noteOn(first), engine.noteOnMidi(second, 69)])
    expect(oscillators).toHaveLength(2)
    expect(oscillators[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(440, 10)
    expect(gains.at(-2)?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.12, 10.012)
    engine.noteOff(off(first))
    expect(oscillators[0]?.stop).toHaveBeenCalledWith(10.065)
    expect(oscillators[1]?.stop).not.toHaveBeenCalled()
    oscillators[0]?.onended?.()
    expect(oscillators[0]?.disconnect).toHaveBeenCalled()
    expect(gains.at(-2)?.disconnect).toHaveBeenCalled()
    engine.releaseSource('midi')
    expect(oscillators[1]?.stop).toHaveBeenCalledTimes(1)
  })

  it('preserves moderate peaks, reserves headroom above unity and meters the final stereo signal', async () => {
    const { engine, gains, shaper, splitter, analysers, context } = audioHarness()
    expect(engine.readOutputPeaks()).toEqual({ left: 0, right: 0 })
    await engine.resume()
    expect(gains[1]?.gain.value).toBe(0.25)
    const curve = shaper.curve!
    const midpoint = (curve.length - 1) / 2
    expect(curve[midpoint + 512]).toBeCloseTo(0.5)
    expect(curve[midpoint + 1024]).toBeLessThan(curve[midpoint + 2048]!)
    expect(curve[0]).toBeCloseTo(-0.95)
    expect(curve.at(-1)).toBeCloseTo(0.95)
    expect(shaper.connect.mock.calls).toEqual([[context.destination], [splitter]])
    expect(splitter.connect.mock.calls).toEqual([[analysers[0], 0], [analysers[1], 1]])
    analysers[0]!.getFloatTimeDomainData.mockImplementation((samples) => samples.fill(-0.25))
    analysers[1]!.getFloatTimeDomainData.mockImplementation((samples) => samples.fill(0.5))
    expect(engine.readOutputPeaks()).toEqual({ left: 0.25, right: 0.5 })
    await engine.dispose()
    expect(shaper.disconnect).toHaveBeenCalledWith(splitter)
    expect(splitter.disconnect).toHaveBeenCalledOnce()
    expect(engine.readOutputPeaks()).toEqual({ left: 0, right: 0 })
  })

  it('cancels pending presses and audition when all notes are released during resume', async () => {
    let unlock!: () => void
    const { engine, oscillators } = audioHarness(new Promise<void>((resolve) => { unlock = resolve }))
    const held = engine.noteOn(note())
    const cancelled = engine.noteOn(note('other'))
    const sequence = engine.play('demo', [{ pitches: [fromMidi(60)], offset: 0, duration: 0.25 }])
    engine.noteOff(off(note()))
    engine.allNotesOff()
    unlock()
    await Promise.all([held, cancelled, sequence])
    expect(oscillators).toHaveLength(0)
  })

  it('schedules chord and arpeggio timing on the audio clock and stops all active or scheduled notes', async () => {
    const { engine, oscillators, context } = audioHarness()
    await engine.noteOnFrequency(note(), { hertz: 330 })
    await engine.play('chords', [
      { pitches: [fromMidi(60), fromMidi(64)], offset: 0, duration: 0.30 },
      { pitches: [fromMidi(67)], offset: 0.50, duration: 0.30 },
    ])
    expect(oscillators.map(({ start }) => start.mock.calls[0])).toEqual([[10], [10.02], [10.02], [10.52]])
    expect(oscillators[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(330, 10)
    engine.allNotesOff()
    expect(oscillators.every(({ stop }) => stop.mock.lastCall?.[0] === 10.065)).toBe(true)
    await engine.dispose()
    expect(context.close).toHaveBeenCalledOnce()
    expect(oscillators.every(({ disconnect }) => disconnect.mock.calls.length > 0)).toBe(true)
  })

  it('bounds voice allocation and allows a rejected audio start to be retried', async () => {
    const { engine, oscillators, context } = audioHarness()
    context.resume.mockRejectedValueOnce(new Error('blocked'))
    await expect(engine.noteOn(note())).rejects.toThrow('blocked')
    await engine.noteOn(note())
    await Promise.all(Array.from({ length: 30 }, (_, i) => engine.noteOn(note('piano', String(i)))))
    expect(oscillators).toHaveLength(24)
    await expect(engine.noteOnFrequency(note(), { hertz: 0 })).rejects.toThrow(RangeError)
  })
})

const pianoManifest = {
  schemaVersion: 1, instrumentId: 'piano', releaseSeconds: 0.24, maxPolyphony: 2,
  samples: [
    { midi: 60, velocity: 0.3, file: 'soft.mp3' },
    { midi: 60, velocity: 0.9, file: 'hard.mp3' },
    { midi: 66, velocity: 0.9, file: 'hard.mp3' },
  ],
}

function servePiano() {
  return vi.fn<typeof fetch>(async (url) => {
    const file = String(url).split('/').at(-1)
    if (file === 'manifest.json') return Response.json(pianoManifest)
    return new Response(Uint8Array.of(file === 'soft.mp3' ? 1 : 2))
  })
}

function sampledHarness(fetchFile: typeof fetch, preferences?: NonNullable<Parameters<typeof createAudioEngine>[1]>['preferences']) {
  return audioHarness(Promise.resolve(), {
    instruments: [sampleInstrument({ id: 'piano', label: 'Piano', baseUrl: '/piano/', fetchFile })],
    defaultInstrumentId: 'piano',
    preferences,
  })
}

async function ready(engine: ReturnType<typeof createAudioEngine>) {
  await vi.waitFor(() => expect(engine.instruments.getState()).toMatchObject({ activeId: 'piano', status: 'ready' }))
}

describe('sampled piano and instrument manager', () => {
  it('loads and decodes unique samples, reports progress, maps pitch and uses real velocity layers', async () => {
    const files = servePiano()
    const { engine, context, buffers, gains } = sampledHarness(files)
    const status = vi.fn(() => engine.instruments.getState())
    engine.instruments.subscribe(status)
    expect(engine.instruments.getState()).toMatchObject({ selectedId: 'piano', activeId: 'synth', status: 'idle' })
    expect(files).not.toHaveBeenCalled()
    await engine.resume()
    await ready(engine)
    expect(status.mock.results.map(({ value }) => value)).toContainEqual(expect.objectContaining({ status: 'loading', total: 3 }))
    expect(engine.instruments.getState()).toMatchObject({ loaded: 3, total: 3 })
    expect(files).toHaveBeenCalledTimes(3)
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2)

    await engine.noteOn({ ...note('pointer', 'soft', 61), velocity: 0.3 })
    await engine.noteOnMidi(note('midi', 'hard'), 61)
    expect(buffers[0]?.buffer).toMatchObject({ marker: 1 })
    expect(buffers[1]?.buffer).toMatchObject({ marker: 2 })
    expect(buffers[0]?.playbackRate.setValueAtTime.mock.lastCall?.[0]).toBeCloseTo(2 ** (1 / 12))
    expect(gains.at(-2)?.gain.linearRampToValueAtTime.mock.lastCall?.[0]).toBeCloseTo(0.246)
    expect(gains.at(-1)?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.82, 10.006)
    expect(buffers.every(({ stop }) => stop.mock.calls.length === 0)).toBe(true)
    await engine.dispose()
    expect(buffers.every(({ disconnect }) => disconnect.mock.calls.length === 1)).toBe(true)
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('initialises and resets instrument trim independently and leaves the fallback bus unchanged', async () => {
    const saveGainDb = vi.fn()
    const { engine, gains, factory } = sampledHarness(servePiano(), {
      load: () => 'piano', save: vi.fn(), loadGainDb: (id) => id === 'piano' ? -6 : 2, saveGainDb,
    })
    expect(engine.instruments.getState().gainDb).toBe(-6)
    engine.instruments.setGainDb(6)
    expect(factory).not.toHaveBeenCalled()
    await engine.resume()
    await ready(engine)
    const [synth, piano] = gains.slice(2)
    expect(synth?.gain.value).toBeCloseTo(10 ** (2 / 20))
    expect(piano?.gain.value).toBeCloseTo(10 ** (6 / 20))
    engine.instruments.setGainDb(0)
    expect(piano?.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 10, 0.015)
    expect(synth?.gain.setTargetAtTime).not.toHaveBeenCalled()
    expect(saveGainDb.mock.calls).toEqual([['piano', 6], ['piano', 0]])
    await engine.instruments.select('synth')
    expect(engine.instruments.getState().gainDb).toBe(2)
    await engine.instruments.select('piano')
    expect(engine.instruments.getState().gainDb).toBe(0)
    expect(() => engine.instruments.setGainDb(13)).toThrow(RangeError)
  })

  it('falls back on asset failure, permits retry and keeps the oscillator usable', async () => {
    const files = servePiano()
    files.mockResolvedValueOnce(new Response(null, { status: 404 }))
    const { engine, oscillators, buffers } = sampledHarness(files)
    await engine.resume()
    await vi.waitFor(() => expect(engine.instruments.getState()).toMatchObject({ status: 'error', activeId: 'synth' }))
    await engine.noteOn(note())
    expect(oscillators).toHaveLength(1)
    expect(buffers).toHaveLength(0)
    await engine.instruments.select('piano')
    await ready(engine)
    await engine.noteOn(note())
    expect(buffers).toHaveLength(1)
  })

  it('rejects invalid manifests and decode failures without activating the piano', async () => {
    const invalid = servePiano()
    invalid.mockResolvedValueOnce(Response.json({
      ...pianoManifest, samples: [{ midi: 60, velocity: 1, file: '../foreign.mp3' }],
    }))
    const first = sampledHarness(invalid)
    await first.engine.resume()
    await vi.waitFor(() => expect(first.engine.instruments.getState().status).toBe('error'))
    expect(invalid).toHaveBeenCalledOnce()

    const second = sampledHarness(servePiano())
    second.context.decodeAudioData.mockRejectedValueOnce(new Error('unsupported encoding'))
    await second.engine.resume()
    await vi.waitFor(() => expect(second.engine.instruments.getState()).toMatchObject({ status: 'error', activeId: 'synth' }))
  })

  it('switches safely, caches decoded buffers and persists the selected instrument', async () => {
    const preferences = { load: vi.fn(() => 'synth'), save: vi.fn() }
    const { engine, context, oscillators, buffers } = sampledHarness(servePiano(), preferences)
    expect(engine.instruments.getState().selectedId).toBe('synth')
    await engine.noteOn(note())
    await engine.instruments.select('piano')
    expect(oscillators[0]?.stop).toHaveBeenCalledWith(10.065)
    await ready(engine)
    await engine.noteOn(note())
    await engine.instruments.select('synth')
    expect(buffers[0]?.stop).toHaveBeenCalledWith(10.24)
    await engine.instruments.select('piano')
    expect(engine.instruments.getState()).toMatchObject({ status: 'ready', activeId: 'piano' })
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2)
    expect(preferences.save.mock.calls.flat()).toEqual(['piano', 'synth', 'piano'])
  })

  it('keeps an existing synth note releasable when the default piano becomes ready', async () => {
    const files = servePiano()
    let allowLoad!: (response: Response) => void
    files.mockReturnValueOnce(new Promise((resolve) => { allowLoad = resolve }))
    const { engine, oscillators, buffers } = sampledHarness(files)
    const early = note('pointer', 'early')
    await engine.noteOn(early)
    expect(oscillators).toHaveLength(1)
    allowLoad(Response.json(pianoManifest))
    await ready(engine)
    await engine.noteOn(note('midi', 'later'))
    engine.noteOff(off(early))
    expect(oscillators[0]?.stop).toHaveBeenCalledWith(10.065)
    expect(buffers[0]?.stop).not.toHaveBeenCalled()
    await engine.dispose()
  })

  it('aborts an obsolete load and retains the new selection after its late result', async () => {
    let finish!: (response: Response) => void
    let signal: AbortSignal | null | undefined
    const files: typeof fetch = (_request, options) => {
      signal = options?.signal
      return new Promise((resolve) => { finish = resolve })
    }
    const { engine } = sampledHarness(files)
    await engine.resume()
    expect(engine.instruments.getState().status).toBe('loading')
    await engine.instruments.select('synth')
    expect(signal?.aborted).toBe(true)
    finish(Response.json(pianoManifest))
    await Promise.resolve()
    expect(engine.instruments.getState()).toMatchObject({ status: 'ready', activeId: 'synth' })
  })

  it('schedules sample chords, steals a voice with a short ramp and releases all sources', async () => {
    const { engine, buffers } = sampledHarness(servePiano())
    await engine.resume()
    await ready(engine)
    await engine.play('chord', [{ pitches: [fromMidi(60), fromMidi(64)], offset: 0, duration: 0.5 }])
    expect(buffers.map(({ start }) => start.mock.lastCall?.[0])).toEqual([10.02, 10.02])
    await engine.noteOn(note('pointer', 'live'))
    expect(buffers).toHaveLength(3)
    expect(buffers[0]?.stop).toHaveBeenLastCalledWith(10.012)
    engine.allNotesOff()
    expect(buffers[1]?.stop).toHaveBeenLastCalledWith(10.24)
    expect(buffers[2]?.stop).toHaveBeenLastCalledWith(10.24)
    buffers[0]?.onended?.()
    expect(buffers[0]?.disconnect).toHaveBeenCalledOnce()
  })

  it('keeps MIDI sustain and independent overlapping sources on the selected piano', async () => {
    const { engine, buffers } = sampledHarness(servePiano())
    await engine.resume()
    await ready(engine)
    const input = createNoteInputManager(engine)
    const port = Object.assign(new EventTarget(), {
      id: 'usb', name: 'USB keys', state: 'connected', connection: 'open',
      open: async () => {}, close: async () => {},
    })
    const access = Object.assign(new EventTarget(), { inputs: new Map([['usb', port]]) })
    const pending: Promise<void>[] = []
    const midi = createMidiInput({
      requestAccess: async () => access as unknown as MIDIAccess,
      emit: (event) => { pending.push(input.dispatch(event)) },
    })
    const send = (...data: number[]) => port.dispatchEvent(Object.assign(new Event('midimessage'), { data: Uint8Array.from(data) }))
    await midi.enable()
    await input.dispatch(note('pointer', 'live', 60))
    send(0xb0, 64, 127)
    send(0x90, 60, 100)
    await Promise.all(pending.splice(0))
    expect(buffers).toHaveLength(2)
    send(0x90, 60, 0)
    expect(buffers[1]?.stop).not.toHaveBeenCalled()
    send(0xb0, 64, 0)
    expect(buffers[1]?.stop).toHaveBeenCalledWith(10.24)
    expect(buffers[0]?.stop).not.toHaveBeenCalled()
    input.panic()
    expect(buffers[0]?.stop).toHaveBeenCalledWith(10.24)
    midi.disable()
    await engine.dispose()
  })
})
