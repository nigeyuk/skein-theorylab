import { formatNote } from '../../music-theory'
import type { Note, NoteLetter } from '../../music-theory'

const letters: NoteLetter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const accidentals = [
  { offset: -2, symbol: '𝄫', label: 'Double flat' },
  { offset: -1, symbol: '♭', label: 'Flat' },
  { offset: 0, symbol: '♮', label: 'Natural' },
  { offset: 1, symbol: '♯', label: 'Sharp' },
  { offset: 2, symbol: '𝄪', label: 'Double sharp' },
]

interface NotePickerProps {
  readonly label: string
  readonly note: Note
  readonly onChange: (note: Note) => void
  readonly keyboardTarget?: boolean
  readonly onKeyboardTarget?: () => void
}

export function NotePicker({ label, note, onChange, keyboardTarget, onKeyboardTarget }: NotePickerProps) {
  const octave = note.octave ?? 4
  return (
    <fieldset className="lab-panel note-picker">
      <legend>{label}</legend>
      <div className="note-picker-heading">
        <output>{formatNote(note, 'unicode')}</output>
        {onKeyboardTarget && (
          <button className="lab-button" type="button" aria-label={'Use keyboard for ' + label.toLowerCase()} aria-pressed={keyboardTarget} onClick={onKeyboardTarget}>
            Use keyboard
          </button>
        )}
      </div>
      <div className="lab-button-row" role="group" aria-label={label + ' letter'}>
        {letters.map((letter) => (
          <button className="lab-button" key={letter} type="button" aria-pressed={letter === note.letter} onClick={() => onChange({ ...note, letter })}>{letter}</button>
        ))}
      </div>
      <div className="note-picker-adjustments">
        <div className="lab-button-row" role="group" aria-label={label + ' accidental'}>
          {accidentals.map(({ offset, symbol, label: name }) => (
            <button className="lab-button" key={offset} type="button" aria-label={name} aria-pressed={offset === note.accidental} onClick={() => onChange({ ...note, accidental: offset })}>{symbol}</button>
          ))}
        </div>
        <div className="lab-button-row" role="group" aria-label={label + ' octave'}>
          <button className="lab-button" type="button" aria-label={'Lower ' + label.toLowerCase() + ' by an octave'} disabled={octave <= -1} onClick={() => onChange({ ...note, octave: octave - 1 })}>−</button>
          <span>Octave {octave}</span>
          <button className="lab-button" type="button" aria-label={'Raise ' + label.toLowerCase() + ' by an octave'} disabled={octave >= 9} onClick={() => onChange({ ...note, octave: octave + 1 })}>+</button>
        </div>
      </div>
    </fieldset>
  )
}
