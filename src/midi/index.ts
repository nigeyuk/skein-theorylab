import { fromMidi } from '../music-theory'
import type { NoteEventSink, NoteOn } from '../note-input'
import { decodeMidiMessage } from './messages'

export { decodeMidiMessage } from './messages'

type RequestAccess = (options: MIDIOptions) => Promise<MIDIAccess>
type MidiStatus = 'unsupported' | 'disabled' | 'requesting' | 'ready' | 'denied' | 'error'

interface Device {
  readonly id: string
  readonly name: string
}

export interface MidiInputState {
  readonly status: MidiStatus
  readonly devices: readonly Device[]
  readonly preferredDevice: string | null
  readonly connectedDevice: Device | null
  readonly channel: number | null
  readonly autoRange: boolean
  readonly deviceError: boolean
}

interface MidiInputOptions {
  readonly emit: NoteEventSink
  readonly requestAccess?: RequestAccess
  readonly preferences?: { load(): string | null; save(device: string | null): void }
}

export function browserMidiRequest(): RequestAccess | undefined {
  if (!globalThis.isSecureContext || typeof globalThis.navigator?.requestMIDIAccess !== 'function') return undefined
  return (options) => navigator.requestMIDIAccess(options)
}

interface HeldNote {
  readonly event: NoteOn
  readonly note: number
  readonly channel: number
  released: boolean
}

export function createMidiInput({ emit, requestAccess, preferences }: MidiInputOptions) {
  const listeners = new Set<() => void>()
  const voices: HeldNote[] = []
  const sustain = new Set<number>()
  let state: MidiInputState = {
    status: requestAccess ? 'disabled' : 'unsupported', devices: [], connectedDevice: null,
    preferredDevice: preferences?.load() ?? null, channel: null, autoRange: false, deviceError: false,
  }
  let access: MIDIAccess | undefined
  let input: MIDIInput | undefined
  let binding: object | undefined
  let request: object | undefined
  let sequence = 0

  function update(update: Partial<MidiInputState>) {
    state = { ...state, ...update }
    for (const listener of listeners) listener()
  }

  function release(note: HeldNote) {
    const index = voices.indexOf(note)
    if (index < 0) return
    voices.splice(index, 1)
    const { sourceId, pressId, origin } = note.event
    emit({ type: 'note-off', sourceId, pressId, origin })
  }

  function resetNotes(channel?: number) {
    for (const note of [...voices]) if (channel === undefined || channel === note.channel) release(note)
    if (channel === undefined) sustain.clear()
    else sustain.delete(channel)
  }

  function receive(event: MIDIMessageEvent) {
    if (!input || !event.data || (event.currentTarget && event.currentTarget !== input)) return
    const message = decodeMidiMessage(event.data)
    if (!message || (state.channel !== null && message.channel !== state.channel)) return
    const { channel } = message

    switch (message.kind) {
      case 'note-on': {
        const note: HeldNote = {
          note: message.note, channel, released: false,
          event: {
            type: 'note-on', sourceId: 'midi:' + input.id, pressId: String(++sequence),
            origin: { kind: 'midi', deviceId: input.id, channel },
            pitch: fromMidi(message.note), velocity: message.velocity,
          },
        }
        voices.push(note)
        emit(note.event)
        break
      }
      case 'note-off': {
        const note = voices.find((voice) => voice.channel === channel && voice.note === message.note && !voice.released)
        if (!note) return
        if (sustain.has(channel)) note.released = true
        else release(note)
        break
      }
      case 'sustain':
        if (message.down) sustain.add(channel)
        else {
          sustain.delete(channel)
          for (const note of [...voices]) if (note.channel === channel && note.released) release(note)
        }
        break
      case 'all-notes-off':
        resetNotes(channel)
        break
    }
  }

  function detach() {
    const previous = input
    input = undefined
    binding = undefined
    if (previous) {
      previous.removeEventListener('midimessage', receive)
      void previous.close().catch(() => {})
    }
    resetNotes()
  }

  const describe = (port: MIDIInput): Device => ({ id: port.id, name: port.name || 'Unnamed MIDI input' })

  function refreshDevices() {
    if (!access) return
    const ports = [...access.inputs.values()].filter((port) => port.state === 'connected')
    const devices = ports.map(describe)
    const next = state.preferredDevice === null ? ports[0] : ports.find((port) => port.id === state.preferredDevice)
    if (input === next) {
      update({ devices, connectedDevice: next && next.connection === 'open' ? describe(next) : null })
      return
    }
    detach()
    input = next
    update({ devices, connectedDevice: null, deviceError: false })
    if (!next) return
    const currentBinding = {}
    binding = currentBinding
    next.addEventListener('midimessage', receive)
    void next.open().then(() => {
      if (binding === currentBinding && next.state === 'connected') update({ connectedDevice: describe(next) })
    }).catch(() => {
      if (binding !== currentBinding) return
      next.removeEventListener('midimessage', receive)
      resetNotes()
      update({ deviceError: true, connectedDevice: null })
    })
  }

  return {
    async enable() {
      if (!requestAccess || request || access) return
      const attempt = {}
      request = attempt
      update({ status: 'requesting' })
      try {
        const next = await requestAccess({ sysex: false })
        if (request !== attempt) return
        access = next
        access.addEventListener('statechange', refreshDevices)
        update({ status: 'ready' })
        refreshDevices()
      } catch (error) {
        if (request !== attempt) return
        const name = error && typeof error === 'object' && 'name' in error ? error.name : ''
        update({ status: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error' })
      } finally {
        if (request === attempt) request = undefined
      }
    },
    disable() {
      request = undefined
      access?.removeEventListener('statechange', refreshDevices)
      access = undefined
      detach()
      update({ status: requestAccess ? 'disabled' : 'unsupported', devices: [], connectedDevice: null, deviceError: false })
    },
    selectDevice(deviceId: string | null) {
      preferences?.save(deviceId)
      update({ preferredDevice: deviceId })
      if (state.deviceError) detach()
      refreshDevices()
    },
    setChannel(channel: number | null) {
      if (channel !== null && (!Number.isInteger(channel) || channel < 1 || channel > 16)) throw new RangeError('MIDI channel must be 1–16')
      if (state.channel === channel) return
      resetNotes()
      update({ channel })
    },
    setAutoRange(autoRange: boolean) { update({ autoRange }) },
    resetNotes,
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

export type MidiInput = ReturnType<typeof createMidiInput>
