import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { version } from '../package.json'
import { AppVersion } from '../src/app/AppVersion'
import { createAudioEngine } from '../src/audio'
import { createNoteInputManager } from '../src/note-input'
import { createMidiInput } from '../src/midi'
import { createKeyboardPreferences } from '../src/storage/keyboard-preferences'
import { KeyboardPanel } from '../src/visualisation/keyboard/KeyboardPanel'
import { fromMidi, parseNote, toPitch } from '../src/music-theory'
import { chordStudy, describeInterval, intervalStudy, stepDistance } from '../src/reference/interactive/calculations'
import { createKeyboardInput } from '../src/visualisation/keyboard/keyboard-input'
import { defaultOctaveRange, fitKeyboardRange, keyAnnotations, keyboardRange, keyboardShortcutIndex, pianoKeys } from '../src/visualisation/keyboard/piano-keys'

describe('virtual keyboard', () => {
  it('maps three octaves to chromatic pitches, whites and correctly positioned accidentals', () => {
    const keys = pianoKeys(defaultOctaveRange)
    expect(keys).toHaveLength(36)
    expect(keys.filter(({ accidental }) => !accidental)).toHaveLength(21)
    expect(keys.slice(0, 12).filter(({ accidental }) => accidental).map(({ position }) => position)).toEqual([1, 2, 4, 5, 6])
    expect(keys[0]?.note).toEqual(parseNote('C3'))
    expect(keys.at(-1)?.note).toEqual(parseNote('B5'))
    expect(keyboardShortcutIndex('KeyZ', 36)).toBe(0)
    expect(keyboardShortcutIndex('KeyQ', 36)).toBe(12)
    expect(keyboardShortcutIndex('KeyQ', 12)).toBeUndefined()
    expect(keyboardShortcutIndex('Space', 36)).toBeUndefined()
  })

  it('shifts and resizes octave ranges without going beyond the keyboard limits', () => {
    expect(pianoKeys(keyboardRange(4, 3))[0]?.note).toEqual(parseNote('C4'))
    expect(keyboardRange(-2, 1)).toEqual({ first: -1, last: -1 })
    expect(keyboardRange(9, 3)).toEqual({ first: 7, last: 9 })
    const fitted = fitKeyboardRange(defaultOctaveRange, [
      { pitch: toPitch(parseNote('A2')) }, { pitch: toPitch(parseNote('A6')) },
    ])
    expect(fitted).toEqual({ first: 2, last: 6 })
    expect(pianoKeys(fitKeyboardRange(defaultOctaveRange, [{ pitch: fromMidi(0) }]))[0]?.pitch).toEqual(fromMidi(0))
  })

  it('maps external enharmonic spellings to the same sounding key with distinct annotations', () => {
    const sharp = parseNote('F#4')
    const flat = parseNote('Gb4')
    const annotations = [
      { pitch: toPitch(sharp), spelling: sharp, chordToneRole: 'Root', highlighted: true },
      { pitch: toPitch(flat), spelling: flat, scaleDegree: '♭5', highlighted: true },
    ]
    const keys = pianoKeys({ first: 4, last: 4 })
    expect(keyAnnotations(keys[6]!, annotations)).toEqual(annotations)
    expect(keyAnnotations(keys[5]!, annotations)).toEqual([])
  })

  it('renders external chord-role highlights and honors disabled and hidden access', () => {
    const audio = createAudioEngine()
    const input = createNoteInputManager(audio)
    const midi = createMidiInput({ emit: () => {} })
    const preferences = createKeyboardPreferences()
    const study = chordStudy(parseNote('Gb4'), 'major', 0)
    const html = renderToStaticMarkup(<KeyboardPanel access={{ mode: 'available' }} audio={audio} input={input} midi={midi} preferences={preferences} annotations={study.annotations} initiallyOpen />)
    expect(html).toContain('aria-label="G♭4, Root, highlighted"')
    expect(html).toContain('data-role="Third"')
    expect(renderToStaticMarkup(<KeyboardPanel audio={audio} input={input} midi={midi} preferences={preferences} access={{ mode: 'hidden' }} />)).toBe('')
    const disabled = renderToStaticMarkup(<KeyboardPanel audio={audio} input={input} midi={midi} preferences={preferences} access={{ mode: 'disabled', reason: 'Exercise restriction' }} initiallyOpen />)
    expect(disabled).toContain('Exercise restriction')
    expect(disabled).not.toContain('aria-label="Piano keys"')
  })

  it('marks only MIDI pitch 60, independently of visual note labels and educational highlights', () => {
    const audio = createAudioEngine()
    const input = createNoteInputManager(audio)
    const midi = createMidiInput({ emit: () => {} })
    const preferences = createKeyboardPreferences()
    const annotations = chordStudy(parseNote('C4'), 'major', 0).annotations
    const render = () => renderToStaticMarkup(<KeyboardPanel access={{ mode: 'available' }} audio={audio} input={input}
      midi={midi} preferences={preferences} annotations={annotations} initiallyOpen />)
    preferences.update({ showNoteLabels: false, firstOctave: 4, octaveCount: 2 })
    const html = render()
    expect(html).toContain('aria-label="C4, Middle C, Root, highlighted"')
    expect(html).toContain('aria-label="C5"')
    expect(html).not.toContain('<span>C5</span>')
    expect(html.match(/class="keyboard-middle-c"/g)).toHaveLength(1)
    expect(html).toContain('data-highlighted="true" data-role="Root"')
    preferences.update({ highlightMiddleC: false })
    expect(render()).not.toContain('class="keyboard-middle-c"')
    expect(render()).toContain('aria-label="C4, Middle C, Root, highlighted"')
    preferences.update({ firstOctave: 5, highlightMiddleC: true, showNoteLabels: true })
    const higher = render()
    expect(higher).not.toContain('Middle C')
    expect(higher).not.toContain('class="keyboard-middle-c"')
    expect(higher).toContain('<span>C5</span>')
  })

  it('leaves controller input and programmatic playback available with the visual keyboard collapsed', async () => {
    const audio = createAudioEngine()
    const noteOn = vi.spyOn(audio, 'noteOn').mockResolvedValue(undefined)
    const play = vi.spyOn(audio, 'play').mockResolvedValue(undefined)
    const input = createNoteInputManager(audio)
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
    const preferences = createKeyboardPreferences()
    await midi.enable()
    preferences.setExpanded(false)
    const html = renderToStaticMarkup(<KeyboardPanel access={{ mode: 'available' }} audio={audio} input={input}
      midi={midi} preferences={preferences} initiallyOpen />)
    expect(html).toContain('Virtual keyboard')
    expect(html).not.toContain('aria-label="Piano keys"')
    port.dispatchEvent(Object.assign(new Event('midimessage'), { data: Uint8Array.of(0x90, 60, 80) }))
    await Promise.all(pending)
    expect(noteOn).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      pitch: fromMidi(60), origin: { kind: 'midi', deviceId: 'usb', channel: 1 },
    }))
    const frames = [{ pitches: [fromMidi(64)], offset: 0, duration: 0.25 }]
    await input.play('study', frames)
    expect(play).toHaveBeenCalledWith('study', frames)
    midi.disable()
    input.panic()
  })

  it('emits independent note lifecycle events and releases every held press once', () => {
    const emit = vi.fn()
    const input = createKeyboardInput('keyboard', emit)
    const pitch = toPitch(parseNote('C4'))
    expect(input.press('mouse:1', pitch)).toBe(true)
    expect(input.press('mouse:1', pitch)).toBe(false)
    expect(input.press('computer:Z', pitch)).toBe(true)
    input.release('mouse:1')
    input.releaseAll()
    input.releaseAll()
    expect(emit.mock.calls.flat()).toEqual([
      { type: 'note-on', sourceId: 'keyboard', pressId: 'mouse:1', pitch, velocity: 0.85 },
      { type: 'note-on', sourceId: 'keyboard', pressId: 'computer:Z', pitch, velocity: 0.85 },
      { type: 'note-off', sourceId: 'keyboard', pressId: 'mouse:1' },
      { type: 'note-off', sourceId: 'keyboard', pressId: 'computer:Z' },
    ])
  })
})

describe('interactive theory workspaces', () => {
  it('uses the core for written intervals, W/H, direction and audition order', () => {
    const c = parseNote('C4')
    const sharp = parseNote('F#5')
    const ascending = intervalStudy(c, sharp)
    expect(ascending.result).toMatchObject({ number: 11, quality: 'augmented', halfSteps: 18, direction: 'ascending' })
    expect(describeInterval(ascending.result)).toBe('augmented 11th')
    expect(stepDistance(ascending.result.halfSteps)).toBe('9W')
    expect(stepDistance(3)).toBe('W + H')
    const descending = intervalStudy(sharp, c)
    expect(descending.result.direction).toBe('descending')
    expect(descending.playback.sequential.map(({ pitches }) => pitches[0])).toEqual([toPitch(sharp), toPitch(c)])
    expect(descending.playback.simultaneous[0]?.pitches).toHaveLength(2)
  })

  it('preserves enharmonic note identities while sharing a sounding unison', () => {
    const sharp = parseNote('F#4')
    const flat = parseNote('Gb4')
    const study = intervalStudy(sharp, flat)
    expect(study.result).toMatchObject({ number: 2, quality: 'diminished', halfSteps: 0 })
    expect(study.annotations.map(({ spelling }) => spelling)).toEqual([sharp, flat])
    expect(study.playback.simultaneous[0]?.pitches).toHaveLength(1)
    expect(study.playback.sequential).toHaveLength(2)
  })

  it('uses the core for chord spelling, role annotations and voiced arpeggio order', () => {
    const study = chordStudy(parseNote('Gb4'), 'dominant-seventh', 3)
    expect(study.result.bass).toEqual(parseNote('Fb5'))
    const expected = ['Gb5', 'Bb5', 'Db6', 'Fb5'].map(parseNote)
    expect(study.annotations.map(({ spelling }) => spelling)).toEqual(expected)
    expect(study.annotations.map(({ chordToneRole }) => chordToneRole)).toEqual(['Root', 'Third', 'Fifth', 'Seventh'])
    expect(study.playback.simultaneous[0]?.pitches).toEqual(study.result.tones.map(toPitch))
    expect(study.playback.sequential.map(({ pitches }) => pitches[0])).toEqual(study.result.tones.map(toPitch))
    expect(study.steps[3]?.interval).toMatchObject({ number: 7, quality: 'minor' })
  })
})

it('renders the app version from package metadata', () => {
  const html = renderToStaticMarkup(<AppVersion />)
  expect(html).toContain('Version')
  expect(html).toContain('<span>' + version + '</span>')
  expect(html).not.toContain('Phase 00')
})
