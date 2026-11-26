import { describe, expect, it, vi } from 'vitest'
import { createAudioEngine } from '../src/audio'
import { fromMidi } from '../src/music-theory'
import type { NoteOn, NoteOff } from '../src/note-input'

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

function audioHarness(resumeGate: Promise<void> = Promise.resolve()) {
  const oscillators: ReturnType<typeof oscillatorNode>[] = []
  const gains: ReturnType<typeof gainNode>[] = []
  const context = {
    state: 'suspended',
    currentTime: 10,
    destination: {},
    createOscillator: vi.fn(() => {
      const oscillator = oscillatorNode()
      oscillators.push(oscillator)
      return oscillator
    }),
    createGain: vi.fn(() => {
      const node = gainNode()
      gains.push(node)
      return node
    }),
    createDynamicsCompressor: vi.fn(() => ({ threshold: param(), connect: vi.fn(), disconnect: vi.fn() })),
    resume: vi.fn(async () => { await resumeGate; context.state = 'running' }),
    close: vi.fn(async () => { context.state = 'closed' }),
  }
  const factory = vi.fn(() => context as unknown as AudioContext)
  return { engine: createAudioEngine(factory), context, factory, oscillators, gains }
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
    expect(gains[0]?.gain.value).toBe(0.8)
    engine.setSettings({ muted: true })
    expect(gains[0]?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.015)
    engine.setSettings({ volume: 0.5 })
    engine.setSettings({ muted: false })
    expect(gains[0]?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.4, 10, 0.015)
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
    expect(gains[1]?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.05, 10.012)
    engine.noteOff(off(first))
    expect(oscillators[0]?.stop).toHaveBeenCalledWith(10.065)
    expect(oscillators[1]?.stop).not.toHaveBeenCalled()
    oscillators[0]?.onended?.()
    expect(oscillators[0]?.disconnect).toHaveBeenCalled()
    expect(gains[1]?.disconnect).toHaveBeenCalled()
    engine.releaseSource('midi')
    expect(oscillators[1]?.stop).toHaveBeenCalledTimes(1)
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
