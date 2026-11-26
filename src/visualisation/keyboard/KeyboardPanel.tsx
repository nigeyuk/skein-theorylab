import { useEffect, useState, useSyncExternalStore } from 'react'
import { ChevronUp, Piano, Volume2, VolumeX } from 'lucide-react'
import type { AudioEngine } from '../../audio'
import type { Note } from '../../music-theory'
import type { MidiInput } from '../../midi'
import type { NoteInputManager } from '../../note-input'
import { MidiControls } from './MidiControls'
import type { KeyboardAccess, KeyboardKeyAnnotation } from './model'
import { PianoKeys } from './PianoKeys'
import { defaultOctaveRange, fitKeyboardRange, keyboardRange, maxKeyboardOctave, minKeyboardOctave } from './piano-keys'
import './keyboard.css'

interface KeyboardPanelProps {
  readonly access: KeyboardAccess
  readonly audio: AudioEngine
  readonly input: NoteInputManager
  readonly midi: MidiInput
  readonly annotations?: readonly KeyboardKeyAnnotation[]
  readonly onNote?: (note: Note) => void
  readonly initiallyOpen?: boolean
}

export function KeyboardPanel({ access, audio, input, midi, annotations = [], onNote, initiallyOpen = false }: KeyboardPanelProps) {
  const [expanded, setExpanded] = useState(initiallyOpen)
  const [range, setRange] = useState(() => fitKeyboardRange(defaultOctaveRange, annotations))
  const [showNoteLabels, setShowNoteLabels] = useState(true)
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
      if (notes.length) setRange((current) => fitKeyboardRange(current, notes))
    }
    fitActiveMidi()
    return input.subscribeNotes((event) => {
      if (event.type === 'note-on' && event.origin?.kind === 'midi') fitActiveMidi()
    })
  }, [access.mode, autoRange, input, policy.feedback])

  if (access.mode === 'hidden') return null

  return (
    <details className="keyboard-dock" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        <Piano size={19} aria-hidden="true" />
        <span>Virtual keyboard</span>
        <span className="keyboard-status">{access.mode === 'disabled' ? 'Unavailable' : 'C' + range.first + '–B' + range.last}</span>
        <ChevronUp className="keyboard-chevron" size={18} aria-hidden="true" />
      </summary>
      {expanded && (
        <div className="keyboard-preview">
          {access.mode === 'disabled' ? <p>{access.reason}</p> : (
            <>
              <div className="keyboard-controls">
                <div className="lab-button-row" role="group" aria-label="Keyboard octave range">
                  <button className="lab-button" type="button" disabled={range.first === minKeyboardOctave} onClick={() => setRange(keyboardRange(range.first - 1, count))}>Octave −</button>
                  <button className="lab-button" type="button" disabled={range.last === maxKeyboardOctave} onClick={() => setRange(keyboardRange(range.first + 1, count))}>Octave +</button>
                  <label className="keyboard-setting">Octaves
                    <select value={count} onChange={(event) => setRange(keyboardRange(range.first, Number(event.target.value)))}>
                      {Array.from({ length: maxKeyboardOctave - minKeyboardOctave + 1 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
                    </select>
                  </label>
                </div>
                <label className="keyboard-setting"><input type="checkbox" checked={showNoteLabels} onChange={(event) => setShowNoteLabels(event.target.checked)} /> Note labels</label>
                <label className="keyboard-setting">Volume
                  <input type="range" min="0" max="100" value={Math.round(volume * 100)} onChange={(event) => audio.setSettings({ volume: Number(event.target.value) / 100 })} />
                </label>
                <button className="lab-button" type="button" aria-pressed={muted} onClick={() => audio.setSettings({ muted: !muted })}>
                  <VolumeIcon size={16} aria-hidden="true" /> Mute
                </button>
                {(fitted.first !== range.first || fitted.last !== range.last) && <button className="lab-button" type="button" onClick={() => setRange(fitted)}>Show selection</button>}
              </div>
              <MidiControls midi={midi} input={input} audio={audio} />
              <PianoKeys config={{ octaveRange: range, showNoteLabels, annotations }} noteInput={input} onNote={onNote} />
            </>
          )}
        </div>
      )}
    </details>
  )
}
