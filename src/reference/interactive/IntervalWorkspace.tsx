import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { enharmonicallyEquivalent, formatNote, parseNote } from '../../music-theory'
import type { Note } from '../../music-theory'
import { describeInterval, intervalStudy, stepDistance } from './calculations'
import { LabExplanation, LabWorkspace, PlaybackControls } from './LabWorkspace'
import type { InteractiveWorkspaceProps } from './LabWorkspace'
import { NotePicker } from './NotePicker'

export function IntervalWorkspace(props: InteractiveWorkspaceProps) {
  const [first, setFirst] = useState(() => parseNote('C4'))
  const [second, setSecond] = useState(() => parseNote('E4'))
  const [target, setTarget] = useState<'first' | 'second'>('first')
  const { result, steps, annotations, playback } = intervalStudy(first, second)
  const [letters, distance] = steps
  const name = describeInterval(result)

  function selectFromKeyboard(note: Note) {
    const select = target === 'first' ? setFirst : setSecond
    select((current) => enharmonicallyEquivalent(current, note) ? current : note)
  }

  return (
    <LabWorkspace {...props} annotations={annotations} onNote={selectFromKeyboard}>
      <div className="lab-layout">
        <div className="lab-inputs">
          <div className="note-picker-grid">
            <NotePicker label="First note" note={first} onChange={setFirst} keyboardTarget={target === 'first'} onKeyboardTarget={() => setTarget('first')} />
            <NotePicker label="Second note" note={second} onChange={setSecond} keyboardTarget={target === 'second'} onKeyboardTarget={() => setTarget('second')} />
          </div>
          <button className="lab-button" type="button" onClick={() => { setFirst(second); setSecond(first) }}>
            <ArrowLeftRight size={16} aria-hidden="true" /> Swap notes
          </button>
        </div>
        <section className="lab-panel lab-result" aria-labelledby="interval-result">
          <h2 id="interval-result" aria-live="polite">{name}</h2>
          <dl className="lab-facts">
            <div><dt>Direction</dt><dd>{result.direction}</dd></div>
            <div><dt>Interval number</dt><dd>{result.number}</dd></div>
            <div><dt>Distance</dt><dd>{Math.abs(result.halfSteps)} H · {stepDistance(Math.abs(result.halfSteps))}</dd></div>
            <div><dt>Span</dt><dd>{result.number > 8 ? 'Compound' : 'Simple'}</dd></div>
          </dl>
          {result.halfSteps < 0 && <p>The sounding pitch moves opposite to the written direction.</p>}
          <PlaybackControls input={props.input} options={[
            { label: 'Play melodically', frames: playback.sequential },
            { label: 'Play together', frames: playback.simultaneous },
          ]} />
        </section>
      </div>
      <LabExplanation title="How it’s measured">
        <ol>
          {letters?.kind === 'letter-count' && <li>{letters.text} {formatNote(first, 'unicode')} to {formatNote(second, 'unicode')} gives {letters.number}.</li>}
          {distance?.kind === 'chromatic-distance' && <li>{distance.text} The baseline is {distance.baseline} H and the measured distance is {distance.halfSteps} H, giving {name}.</li>}
        </ol>
      </LabExplanation>
    </LabWorkspace>
  )
}
