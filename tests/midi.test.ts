import { describe, expect, it, vi } from 'vitest'
import { browserMidiRequest, createMidiInput, decodeMidiMessage } from '../src/midi'
import { fromMidi } from '../src/music-theory'
import { createNoteInputManager } from '../src/note-input'
import type { AudioEngine } from '../src/audio'

class MidiPort extends EventTarget {
  state: MIDIPortDeviceState = 'connected'
  connection: MIDIPortConnectionState = 'closed'

  constructor(readonly id: string, readonly name: string) { super() }

  open = vi.fn(async () => { this.connection = 'open'; return this })
  close = vi.fn(async () => { this.connection = 'closed'; return this })

  send(...data: number[]) {
    const message = Object.assign(new Event('midimessage'), { data: Uint8Array.from(data) })
    this.dispatchEvent(message)
  }
}

class MidiAccess extends EventTarget {
  inputs = new Map<string, MidiPort>()

  connect(port: MidiPort) {
    port.state = 'connected'
    this.inputs.set(port.id, port)
    this.dispatchEvent(new Event('statechange'))
  }

  disconnect(port: MidiPort) {
    port.state = 'disconnected'
    this.dispatchEvent(new Event('statechange'))
  }
}

function harness(preferred: string | null = null) {
  const access = new MidiAccess()
  const first = new MidiPort('first', 'USB controller')
  const second = new MidiPort('second', 'Second controller')
  access.connect(first)
  const emit = vi.fn()
  const preferences = { load: vi.fn(() => preferred), save: vi.fn() }
  const requestAccess = vi.fn<(options: MIDIOptions) => Promise<MIDIAccess>>(async () => access as unknown as MIDIAccess)
  const midi = createMidiInput({ emit, requestAccess, preferences })
  return { access, first, second, emit, requestAccess, preferences, midi }
}

describe('MIDI message decoding', () => {
  it('decodes channels, velocities and the two note-off forms', () => {
    expect(decodeMidiMessage([0x9f, 69, 95])).toEqual({ kind: 'note-on', channel: 16, note: 69, velocity: 95 / 127 })
    expect(decodeMidiMessage([0x81, 60, 42])).toEqual({ kind: 'note-off', channel: 2, note: 60 })
    expect(decodeMidiMessage([0x91, 60, 0])).toEqual({ kind: 'note-off', channel: 2, note: 60 })
    expect(decodeMidiMessage([0xb0, 64, 64])).toMatchObject({ kind: 'sustain', down: true })
    expect(decodeMidiMessage([0xb0, 64, 63])).toMatchObject({ kind: 'sustain', down: false })
    expect(decodeMidiMessage([0xb1, 120, 0])).toEqual({ kind: 'all-notes-off', channel: 2 })
    expect(decodeMidiMessage([0xb1, 123, 0])).toEqual({ kind: 'all-notes-off', channel: 2 })
  })

  it.each([[0xf0, 64, 127], [0xfe], [0x90, 130, 1], [0x90, 60], [0xe0, 60, 90]])(
    'ignores unsupported or malformed messages (%j, %j, %j)', (...data) => {
      expect(decodeMidiMessage(data)).toBeUndefined()
    },
  )
})

describe('Web MIDI input', () => {
  it('requires explicit enable, requests no SysEx and discovers inputs across hot-plug', async () => {
    const { midi, first, second, access, requestAccess } = harness()
    expect(requestAccess).not.toHaveBeenCalled()
    expect(midi.getState().status).toBe('disabled')
    await midi.enable()
    expect(requestAccess).toHaveBeenCalledWith({ sysex: false })
    expect(midi.getState()).toMatchObject({ status: 'ready', connectedDevice: { id: 'first', name: 'USB controller' } })
    expect(first.open).toHaveBeenCalledOnce()
    access.connect(second)
    expect(midi.getState().devices.map(({ id }) => id)).toEqual(['first', 'second'])
    expect(first.open).toHaveBeenCalledOnce()
    expect(second.open).not.toHaveBeenCalled()
    access.disconnect(first)
    await Promise.resolve()
    expect(midi.getState().connectedDevice?.id).toBe('second')
    expect(first.close).toHaveBeenCalledOnce()
  })

  it('persists device selection, waits for a missing preference and reconnects it', async () => {
    const { midi, access, first, second, preferences } = harness('second')
    await midi.enable()
    expect(midi.getState().preferredDevice).toBe('second')
    expect(midi.getState().connectedDevice).toBeNull()
    access.connect(second)
    await Promise.resolve()
    expect(midi.getState().connectedDevice?.id).toBe('second')
    access.disconnect(second)
    expect(midi.getState().connectedDevice).toBeNull()
    midi.selectDevice('first')
    await Promise.resolve()
    expect(first.open).toHaveBeenCalledOnce()
    expect(preferences.save).toHaveBeenCalledWith('first')
    midi.selectDevice(null)
    expect(preferences.save).toHaveBeenLastCalledWith(null)
  })

  it('keeps independent pitch presses on different channels and normalises velocity', async () => {
    const { midi, first, emit } = harness()
    await midi.enable()
    first.send(0x90, 60, 32)
    first.send(0x91, 60, 127)
    first.send(0x91, 60, 0)
    first.send(0x80, 60, 0)
    const calls = emit.mock.calls.map(([event]) => event)
    expect(calls).toEqual([
      expect.objectContaining({ type: 'note-on', pressId: '1', pitch: fromMidi(60), velocity: 32 / 127, origin: { kind: 'midi', deviceId: 'first', channel: 1 } }),
      expect.objectContaining({ type: 'note-on', pressId: '2', pitch: fromMidi(60), velocity: 1, origin: { kind: 'midi', deviceId: 'first', channel: 2 } }),
      expect.objectContaining({ type: 'note-off', pressId: '2' }),
      expect.objectContaining({ type: 'note-off', pressId: '1' }),
    ])
  })

  it('filters by channel and releases old presses when the filter changes', async () => {
    const { midi, first, emit } = harness()
    await midi.enable()
    midi.setChannel(3)
    first.send(0x90, 60, 100)
    first.send(0x92, 64, 100)
    expect(emit).toHaveBeenCalledTimes(1)
    midi.setChannel(1)
    expect(emit.mock.calls[1]?.[0]).toMatchObject({ type: 'note-off', origin: { channel: 3 } })
    first.send(0x82, 64, 0)
    expect(emit).toHaveBeenCalledTimes(2)
  })

  it('defers note-off with CC64 and releases sustained notes only on their own channel', async () => {
    const { midi, first, emit } = harness()
    await midi.enable()
    first.send(0xb0, 64, 127)
    first.send(0x90, 60, 100)
    first.send(0x90, 60, 0)
    first.send(0x90, 60, 120)
    first.send(0x91, 60, 110)
    first.send(0x81, 60, 0)
    expect(emit.mock.calls.map(([event]) => event.pressId)).toEqual(['1', '2', '3', '3'])
    first.send(0xb0, 64, 0)
    expect(emit.mock.lastCall?.[0]).toMatchObject({ type: 'note-off', pressId: '1' })
    first.send(0x80, 60, 0)
    expect(emit.mock.lastCall?.[0]).toMatchObject({ type: 'note-off', pressId: '2' })
  })

  it('cancels pedal-held and active notes on channel panic, unplug and disable', async () => {
    const { midi, access, first, second, emit } = harness()
    await midi.enable()
    first.send(0xb0, 64, 127)
    first.send(0x90, 60, 100)
    first.send(0x80, 60, 0)
    first.send(0x91, 64, 100)
    first.send(0xb0, 123, 0)
    expect(emit.mock.lastCall?.[0]).toMatchObject({ type: 'note-off', pressId: '1' })
    access.disconnect(first)
    expect(emit.mock.lastCall?.[0]).toMatchObject({ type: 'note-off', pressId: '2' })
    const events = emit.mock.calls.length
    first.send(0x90, 60, 100)
    expect(emit).toHaveBeenCalledTimes(events)
    access.connect(second)
    await Promise.resolve()
    second.send(0x90, 67, 127)
    midi.disable()
    expect(emit.mock.lastCall?.[0]).toMatchObject({ type: 'note-off', sourceId: 'midi:second' })
    expect(midi.getState().status).toBe('disabled')
    access.connect(first)
    expect(first.open).toHaveBeenCalledOnce()
    second.send(0x90, 67, 100)
    expect(emit).toHaveBeenCalledTimes(events + 2)
  })

  it('reports denied and unsupported access and allows retry', async () => {
    const { midi, requestAccess } = harness()
    requestAccess.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    await midi.enable()
    expect(midi.getState().status).toBe('denied')
    await midi.enable()
    expect(midi.getState().status).toBe('ready')
    expect(browserMidiRequest()).toBeUndefined()
    const unsupported = createMidiInput({ emit: vi.fn() })
    await unsupported.enable()
    expect(unsupported.getState().status).toBe('unsupported')
  })

  it('ignores a permission grant after MIDI has been disabled', async () => {
    const { midi, first, access, requestAccess } = harness()
    let grant!: (access: MIDIAccess) => void
    requestAccess.mockReturnValueOnce(new Promise((resolve) => { grant = resolve }))
    const enabling = midi.enable()
    midi.disable()
    grant(access as unknown as MIDIAccess)
    await enabling
    expect(first.open).not.toHaveBeenCalled()
    expect(midi.getState().status).toBe('disabled')
  })
})

function managerHarness() {
  const mock = {
    noteOn: vi.fn(async () => {}), noteOff: vi.fn(), play: vi.fn(async () => {}),
    allNotesOff: vi.fn(), releaseSource: vi.fn(),
  }
  const manager = createNoteInputManager(mock as unknown as AudioEngine)
  return { mock, manager }
}

describe('unified input manager', () => {
  it('keeps a virtual key and controller press on the same sounding pitch independent', async () => {
    const { manager, mock } = managerHarness()
    const event = { type: 'note-on' as const, pressId: 'same', pitch: fromMidi(60), velocity: 0.5 }
    const observer = vi.fn()
    manager.subscribeNotes(observer)
    await manager.dispatch({ ...event, sourceId: 'pointer', origin: { kind: 'pointer' } })
    await manager.dispatch({ ...event, sourceId: 'computer', origin: { kind: 'computer' } })
    await manager.dispatch({ ...event, sourceId: 'midi:usb', origin: { kind: 'midi', deviceId: 'usb', channel: 4 } })
    expect(mock.noteOn).toHaveBeenCalledTimes(3)
    await manager.dispatch({ type: 'note-off', sourceId: 'midi:usb', pressId: 'same' })
    expect(manager.getActiveNotes().map(({ sourceId }) => sourceId)).toEqual(['pointer', 'computer'])
    expect(mock.noteOff).toHaveBeenCalledWith({ type: 'note-off', sourceId: 'midi:usb', pressId: 'same' })
    expect(observer.mock.lastCall?.[0]).toMatchObject({ type: 'note-off', pitch: event.pitch, velocity: 0.5, origin: { channel: 4 } })
    manager.panic()
    expect(mock.allNotesOff).toHaveBeenCalledOnce()
    expect(manager.getActiveNotes()).toEqual([])
  })

  it('lets exercises restrict MIDI and suppress feedback independently of input', async () => {
    const { manager, mock } = managerHarness()
    const observer = vi.fn()
    manager.subscribePolicy(observer)
    const event = {
      type: 'note-on' as const, sourceId: 'midi:usb', pressId: '1', pitch: fromMidi(60), velocity: 0.7,
      origin: { kind: 'midi' as const, deviceId: 'usb', channel: 1 },
    }
    manager.setMidiPolicy({ input: true, feedback: false })
    await manager.dispatch(event)
    expect(manager.getMidiPolicy().feedback).toBe(false)
    expect(mock.noteOn).toHaveBeenCalledOnce()
    manager.setMidiPolicy({ input: false, feedback: false })
    expect(mock.releaseSource).toHaveBeenCalledWith('midi:usb')
    expect(manager.getActiveNotes()).toEqual([])
    await manager.dispatch(event)
    expect(mock.noteOn).toHaveBeenCalledOnce()
    expect(observer).toHaveBeenCalledTimes(2)
  })

  it('publishes programmatic notes while preserving audio-clock scheduling and cancelling queued events', async () => {
    vi.useFakeTimers()
    try {
      const { manager, mock } = managerHarness()
      const frames = [{ pitches: [fromMidi(60), fromMidi(64)], offset: 0, duration: 0.5 },
        { pitches: [fromMidi(67)], offset: 0.6, duration: 0.2 }]
      const events = vi.fn()
      manager.subscribeNotes(events)
      await manager.play('study', frames)
      expect(mock.play).toHaveBeenCalledWith('study', frames)
      await vi.advanceTimersByTimeAsync(5)
      expect(manager.getActiveNotes()).toHaveLength(2)
      expect(events.mock.lastCall?.[0]).toMatchObject({ origin: { kind: 'programmatic' } })
      manager.panic()
      await vi.runAllTimersAsync()
      expect(manager.getActiveNotes()).toEqual([])
      expect(events).toHaveBeenCalledTimes(4)
    } finally {
      vi.useRealTimers()
    }
  })
})
