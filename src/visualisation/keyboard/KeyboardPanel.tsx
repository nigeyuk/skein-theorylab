import { ChevronUp, Piano } from 'lucide-react'
import type { KeyboardAccess } from './model'
import './keyboard.css'

const naturals = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

export function KeyboardPanel({ access }: { access: KeyboardAccess }) {
  if (access.mode === 'hidden') return null

  return (
    <details className="keyboard-dock">
      <summary>
        <Piano size={19} aria-hidden="true" />
        <span>Virtual keyboard</span>
        <span className="keyboard-status">{access.mode === 'disabled' ? 'Unavailable' : 'Preview'}</span>
        <ChevronUp className="keyboard-chevron" size={18} aria-hidden="true" />
      </summary>
      <div className="keyboard-preview">
        {access.mode === 'disabled' ? <p>{access.reason}</p> : (
          <>
            <p>Playable keys and audio will be added in a dedicated keyboard phase.</p>
            <div className="keyboard-keys" aria-hidden="true">
              {[0, 1].map((octave) => (
                <div className="keyboard-octave" key={octave}>
                  {naturals.map((note) => <span className="keyboard-natural" key={note} />)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </details>
  )
}
