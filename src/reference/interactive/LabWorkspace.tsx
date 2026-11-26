import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Play, Square } from 'lucide-react'
import type { AudioEngine, PlaybackFrame } from '../../audio'
import type { Note } from '../../music-theory'
import type { MidiInput } from '../../midi'
import type { NoteInputManager } from '../../note-input'
import type { KeyboardPreferences } from '../../storage/keyboard-preferences'
import { noteForPitch } from '../../visualisation/keyboard/piano-keys'
import { KeyboardPanel } from '../../visualisation/keyboard/KeyboardPanel'
import type { KeyboardAccess, KeyboardKeyAnnotation } from '../../visualisation/keyboard/model'
import './lab.css'

export interface InteractiveWorkspaceProps {
  readonly title: string
  readonly description: string
  readonly access: KeyboardAccess
  readonly audio: AudioEngine
  readonly input: NoteInputManager
  readonly midi: MidiInput
  readonly preferences: KeyboardPreferences
}

interface LabWorkspaceProps extends InteractiveWorkspaceProps {
  readonly annotations: readonly KeyboardKeyAnnotation[]
  readonly onNote: (note: Note) => void
  readonly children: ReactNode
}

export function LabWorkspace({ title, description, access, audio, input, midi, preferences, annotations, onNote, children }: LabWorkspaceProps) {
  useEffect(() => input.subscribeNotes((event) => {
    if (event.type === 'note-on' && event.origin?.kind === 'midi' && input.getMidiPolicy().feedback) {
      onNote(noteForPitch(event.pitch))
    }
  }), [input, onNote])

  return (
    <>
      <div className="content">
        <section className="theory-lab" aria-labelledby="workspace-title">
          <header className="lab-heading">
            <h1 id="workspace-title" tabIndex={-1}>{title}</h1>
            <p>{description}</p>
          </header>
          {children}
        </section>
      </div>
      <KeyboardPanel access={access} audio={audio} input={input} midi={midi} preferences={preferences} annotations={annotations} onNote={onNote} initiallyOpen />
    </>
  )
}

interface PlaybackControlsProps {
  readonly input: NoteInputManager
  readonly options: readonly { readonly label: string; readonly frames: readonly PlaybackFrame[] }[]
}

export function PlaybackControls({ input, options }: PlaybackControlsProps) {
  const source = useId()
  const [error, setError] = useState('')

  useEffect(() => () => input.releaseSource(source), [input, source])

  return (
    <>
      <div className="lab-button-row" role="group" aria-label="Playback">
        {options.map(({ label, frames }, index) => (
          <button key={label} type="button" className={'lab-button' + (index === 0 ? ' lab-primary' : '')} onClick={() => {
            setError('')
            input.play(source, frames).catch(() => setError('Audio could not start. Try playback again.'))
          }}>
            <Play size={16} aria-hidden="true" /> {label}
          </button>
        ))}
        <button type="button" className="lab-button" onClick={() => input.releaseSource(source)}><Square size={14} aria-hidden="true" /> Stop</button>
      </div>
      {error && <p role="status">{error}</p>}
    </>
  )
}
