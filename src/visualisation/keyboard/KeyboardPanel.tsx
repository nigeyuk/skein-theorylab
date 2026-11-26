import { useEffect, useState, useSyncExternalStore } from 'react'
import { ChevronUp, Piano, Volume2, VolumeX } from 'lucide-react'
import type { AudioEngine } from '../../audio'
import type { Note } from '../../music-theory'
import type { MidiInput } from '../../midi'
import type { NoteInputManager } from '../../note-input'
import type { KeyboardPreferences } from '../../storage/keyboard-preferences'
import { InstrumentControls } from './InstrumentControls'
import { MidiControls } from './MidiControls'
import type { KeyboardAccess, KeyboardKeyAnnotation } from './model'
import { PianoKeys } from './PianoKeys'
import { fitKeyboardRange, keyboardRange, maxKeyboardOctave, minKeyboardOctave } from './piano-keys'
import './keyboard.css'

interface KeyboardPanelProps {
  readonly access: KeyboardAccess
  readonly audio: AudioEngine
  readonly input: NoteInputManager
  readonly midi: MidiInput
  readonly preferences: KeyboardPreferences
  readonly annotations?: readonly KeyboardKeyAnnotation[]
  readonly onNote?: (note: Note) => void
  readonly initiallyOpen?: boolean
}

export function KeyboardPanel({ access, audio, input, midi, preferences, annotations = [], onNote, initiallyOpen = false }: KeyboardPanelProps) {
  const saved = useSyncExternalStore(preferences.subscribe, preferences.getState, preferences.getState)
  const [restrictedExpanded, setRestrictedExpanded] = useState(initiallyOpen)
  const [temporaryRange, setTemporaryRange] = useState<ReturnType<typeof keyboardRange> | null>(null)
  const baseRange = keyboardRange(saved.firstOctave, saved.octaveCount)
  const range = temporaryRange ?? baseRange
  const expanded = access.mode === 'available' ? saved.expanded ?? initiallyOpen : restrictedExpanded
  const { volume, muted } = useSyncExternalStore(audio.subscribe, audio.getSettings, audio.getSettings)
  const count = range.last - range.first + 1
  const fitted = fitKeyboardRange(range, annotations)
  const VolumeIcon = muted ? VolumeX : Volume2

  const { autoRange } = useSyncExternalStore(midi.subscribe, midi.getState, midi.getState)
  const policy = useSyncExternalStore(input.subscribePolicy, input.getMidiPolicy, input.getMidiPolicy)

  useEffect(() => {
    if (!autoRange || !policy.feedback || access.mode !== 'available') return
    function fitActiveMidi() {
      const notes = input.getActiveNotes().filter((note) => note.origin?.kind === 'midi')
      if (notes.length) setTemporaryRange(fitKeyboardRange(keyboardRange(saved.firstOctave, saved.octaveCount), notes))
    }
    fitActiveMidi()
    return input.subscribeNotes((event) => {
      if (event.type === 'note-on' && event.origin?.kind === 'midi') fitActiveMidi()
    })
  }, [access.mode, autoRange, input, policy.feedback, saved.firstOctave, saved.octaveCount])

  function saveRange(firstOctave: number, octaveCount: number) {
    setTemporaryRange(null)
    preferences.update({ firstOctave, octaveCount })
  }

  if (access.mode === 'hidden') return null

  return (
    <details className="keyboard-dock" open={expanded}>
      <summary onClick={(event) => {
        event.preventDefault()
        if (access.mode === 'available') preferences.update({ expanded: !expanded })
        else setRestrictedExpanded(!expanded)
      }}>
        <Piano size={19} aria-hidden="true" />
        <span>Virtual keyboard</span>
        <span className="keyboard-status">{access.mode === 'disabled' ? 'Unavailable' : 'C' + range.first + '–B' + range.last}</span>
        <ChevronUp className="keyboard-chevron" size={18} aria-hidden="true" />
      </summary>
      {expanded && (
        <div className={access.mode === 'available' ? 'keyboard-preview keyboard-playable' : 'keyboard-preview'}>
          {access.mode === 'disabled' ? <p>{access.reason}</p> : (
            <>
              <div className="keyboard-toolbar">
                <div className="keyboard-controls">
                  <div className="lab-button-row" role="group" aria-label="Keyboard octave range">
                    <button className="lab-button" type="button" disabled={range.first === minKeyboardOctave} onClick={() => saveRange(range.first - 1, saved.octaveCount)}>Octave −</button>
                    <button className="lab-button" type="button" disabled={range.last === maxKeyboardOctave} onClick={() => saveRange(range.first + 1, saved.octaveCount)}>Octave +</button>
                    <label className="keyboard-setting">Octaves
                      <select value={count} onChange={(event) => saveRange(range.first, Number(event.target.value))}>
                        {Array.from({ length: maxKeyboardOctave - minKeyboardOctave + 1 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="keyboard-setting"><input type="checkbox" checked={saved.showNoteLabels} onChange={(event) => preferences.update({ showNoteLabels: event.target.checked })} /> Note labels</label>
                  <label className="keyboard-setting">Volume
                    <input type="range" min="0" max="100" value={Math.round(volume * 100)} onChange={(event) => audio.setSettings({ volume: Number(event.target.value) / 100 })} />
                  </label>
                  <button className="lab-button" type="button" aria-pressed={muted} onClick={() => audio.setSettings({ muted: !muted })}>
                    <VolumeIcon size={16} aria-hidden="true" /> Mute
                  </button>
                  {(fitted.first !== range.first || fitted.last !== range.last) && <button className="lab-button" type="button" onClick={() => setTemporaryRange(fitted)}>Show selection</button>}
                </div>
                <InstrumentControls controls={audio.instruments} onChange={() => { midi.resetNotes(); input.panic() }} />
                <MidiControls midi={midi} input={input} audio={audio} />
              </div>
              <PianoKeys config={{ octaveRange: range, showNoteLabels: saved.showNoteLabels, annotations }} noteInput={input} onNote={onNote} />
            </>
          )}
        </div>
      )}
    </details>
  )
}
