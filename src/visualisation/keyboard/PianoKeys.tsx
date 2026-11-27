import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { FocusEvent, KeyboardEvent, PointerEvent } from 'react'
import { formatNote, fromMidi } from '../../music-theory'
import type { Note } from '../../music-theory'
import type { NoteInputManager } from '../../note-input'
import { createKeyboardInput } from './keyboard-input'
import { keyAnnotations, keyboardShortcutIndex, pianoKeys, pitchKey } from './piano-keys'
import type { KeyboardViewConfig } from './model'
import type { PianoKey } from './piano-keys'

interface PianoKeysProps {
  readonly config: KeyboardViewConfig
  readonly noteInput: NoteInputManager
  readonly onNote?: (note: Note) => void
}

const playbackError = 'Audio could not start. Try pressing a key again.'
const middleC = pitchKey(fromMidi(60))
const shortRoles: Readonly<Record<string, string>> = { Third: '3rd', Fifth: '5th', Seventh: '7th' }

export function PianoKeys({ config, noteInput, onNote }: PianoKeysProps) {
  const { octaveRange, showNoteLabels, highlightMiddleC, annotations } = config
  const source = useId()
  const keys = pianoKeys(octaveRange)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const activeNotes = useSyncExternalStore(noteInput.subscribe, noteInput.getActiveNotes, noteInput.getActiveNotes)
  const policy = useSyncExternalStore(noteInput.subscribePolicy, noteInput.getMidiPolicy, noteInput.getMidiPolicy)
  const [error, setError] = useState('')
  const root = useRef<HTMLDivElement>(null)

  const input = useMemo(() => createKeyboardInput(source, (event) => {
    if (event.type === 'note-on') setError('')
    void noteInput.dispatch(event).catch(() => setError(playbackError))
  }), [noteInput, source])

  useEffect(() => {
    const keyUp = (event: globalThis.KeyboardEvent) => input.release('key:' + event.code)
    const pointerEnd = (event: globalThis.PointerEvent) => input.release('pointer:' + event.pointerId)
    const release = () => {
      input.releaseAll()
      noteInput.releaseSource(source)
      noteInput.releaseSource(source + ':activation')
    }
    const visibility = () => { if (document.hidden) release() }
    window.addEventListener('keyup', keyUp)
    window.addEventListener('pointerup', pointerEnd)
    window.addEventListener('pointercancel', pointerEnd)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('pointerup', pointerEnd)
      window.removeEventListener('pointercancel', pointerEnd)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', visibility)
      release()
    }
  }, [input, noteInput, source])

  function press(id: string, key: PianoKey) {
    if (input.press(id, key.pitch, id.startsWith('pointer:') ? 'pointer' : 'computer')) onNote?.(key.note)
  }

  function pressPointer(event: PointerEvent<HTMLButtonElement>, key: PianoKey) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus({ preventScroll: true })
    press('pointer:' + event.pointerId, key)
  }

  function releasePointer(event: PointerEvent<HTMLButtonElement>) {
    input.release('pointer:' + event.pointerId)
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing) return
    const focusedKey = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>('[data-key-index]') : null
    const currentIndex = Number(focusedKey?.dataset.keyIndex ?? Math.min(focusedIndex, keys.length - 1))
    if (event.key === 'Escape') {
      input.releaseAll()
      noteInput.releaseSource(source)
      noteInput.releaseSource(source + ':activation')
      return
    }
    const directions: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 }
    const delta = directions[event.key]
    if (delta || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1
        : Math.max(0, Math.min(keys.length - 1, currentIndex + delta!))
      root.current?.querySelector<HTMLButtonElement>('[data-key-index="' + next + '"]')?.focus()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!event.repeat) press('key:' + event.code, keys[currentIndex]!)
      return
    }
    const index = keyboardShortcutIndex(event.code, keys.length)
    if (index === undefined) return
    event.preventDefault()
    if (!event.repeat) press('key:' + event.code, keys[index]!)
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      input.releaseAll()
      noteInput.releaseSource(source)
      noteInput.releaseSource(source + ':activation')
    }
  }

  const sounding = new Set(activeNotes.filter((note) => policy.feedback || note.origin?.kind !== 'midi').map(({ pitch }) => pitchKey(pitch)))

  return (
    <>
      <p className="keyboard-help" id={source}>Focus a piano key to play with Z–M or Q–U and the keys above them. Use arrow keys to move and Enter or Space to play the focused note.</p>
      {error && <p role="status">{error}</p>}
      <div className="keyboard-scroll" ref={root} role="group" aria-label="Piano keys" aria-describedby={source} onKeyDown={handleKey} onBlur={handleBlur}>
        <div className="keyboard-keys">
          {Array.from({ length: keys.length / 12 }, (_, octaveIndex) => (
            <div className="keyboard-octave" key={octaveRange.first + octaveIndex}>
              {keys.slice(octaveIndex * 12, (octaveIndex + 1) * 12).map((key, localIndex) => {
                const index = octaveIndex * 12 + localIndex
                const matches = keyAnnotations(key, annotations)
                const spelling = matches.flatMap(({ spelling }) => spelling ? [formatNote(spelling, 'unicode')] : [])
                const label = [...new Set(spelling)].join(' / ') || formatNote(key.note, 'unicode')
                const roles = [...new Set(matches.flatMap(({ chordToneRole, scaleDegree }) => [chordToneRole, scaleDegree].filter((role): role is string => Boolean(role))))]
                const active = sounding.has(pitchKey(key.pitch))
                const highlighted = matches.some((annotation) => annotation.highlighted)
                const isMiddleC = pitchKey(key.pitch) === middleC
                return (
                  <button
                    key={pitchKey(key.pitch)}
                    className={key.accidental ? 'keyboard-key keyboard-accidental' : 'keyboard-key keyboard-natural'}
                    type="button"
                    aria-label={[label, isMiddleC ? 'Middle C' : null, ...roles, highlighted ? 'highlighted' : null].filter(Boolean).join(', ')}
                    aria-pressed={active}
                    data-highlighted={highlighted || undefined}
                    data-role={matches.find((annotation) => annotation.chordToneRole)?.chordToneRole}
                    data-key-index={index}
                    tabIndex={index === Math.min(focusedIndex, keys.length - 1) ? 0 : -1}
                    style={key.accidental ? { left: key.position / 7 * 100 + '%' } : undefined}
                    onFocus={() => setFocusedIndex(index)}
                    onPointerDown={(event) => pressPointer(event, key)}
                    onPointerUp={releasePointer}
                    onPointerCancel={releasePointer}
                    onLostPointerCapture={releasePointer}
                    onClick={(event) => {
                      if (event.detail !== 0) return
                      setError('')
                      onNote?.(key.note)
                      noteInput.play(source + ':activation', [{ pitches: [key.pitch], offset: 0, duration: 0.24 }]).catch(() => setError(playbackError))
                    }}
                  >
                    {isMiddleC && highlightMiddleC && <span className="keyboard-middle-c" aria-hidden="true">C4</span>}
                    {showNoteLabels && <span>{label}</span>}
                    {roles.length > 0 && <span className="keyboard-key-role">{roles.map((role) => shortRoles[role] ?? role).join(' / ')}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
