import { useState } from 'react'
import { chordFormula, chordQualities, enharmonicallyEquivalent, formatNote, parseNote } from '../../music-theory'
import type { ChordQuality, Note } from '../../music-theory'
import { chordStudy, describeInterval, stepDistance } from './calculations'
import { LabExplanation, LabWorkspace, PlaybackControls } from './LabWorkspace'
import type { InteractiveWorkspaceProps } from './LabWorkspace'
import { NotePicker } from './NotePicker'

const inversionNames = ['Root position', 'First inversion', 'Second inversion', 'Third inversion']
const qualityGroups = [3, 4].map((size) => ({
  label: size === 3 ? 'Triads' : 'Sevenths',
  qualities: chordQualities.filter((quality) => chordFormula(quality).length === size),
}))

export function ChordWorkspace(props: InteractiveWorkspaceProps) {
  const [root, setRoot] = useState(() => parseNote('C4'))
  const [quality, setQuality] = useState<ChordQuality>('major')
  const [inversion, setInversion] = useState(0)
  const { result, steps, annotations, playback } = chordStudy(root, quality, inversion)

  function selectFromKeyboard(note: Note) {
    setRoot((current) => enharmonicallyEquivalent(current, note) ? current : note)
  }

  return (
    <LabWorkspace {...props} annotations={annotations} onNote={selectFromKeyboard}>
      <div className="lab-layout lab-layout--chords">
        <div className="lab-inputs">
          <NotePicker label="Chord root" note={root} onChange={setRoot} />
          <fieldset className="lab-panel lab-voicing">
            <legend>Voicing</legend>
            <label className="lab-select-label">Chord quality
              <select className="lab-select" value={quality} onChange={(event) => {
                const next = chordQualities.find((candidate) => candidate === event.target.value)
                if (!next) return
                setQuality(next)
                setInversion((current) => Math.min(current, chordFormula(next).length - 1))
              }}>
                {qualityGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.qualities.map((option) => <option value={option} key={option}>{option.replaceAll('-', ' ')}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="lab-button-row" role="group" aria-label="Chord inversion">
              {result.tones.map((_, index) => (
                <button className="lab-button" type="button" key={index} aria-pressed={inversion === index} onClick={() => setInversion(index)}>{inversionNames[index]}</button>
              ))}
            </div>
          </fieldset>
        </div>
        <section className="lab-panel lab-result" aria-labelledby="chord-result">
          <h2 id="chord-result" aria-live="polite">{formatNote(root, 'unicode')} {quality.replaceAll('-', ' ')}</h2>
          <p>{inversionNames[inversion]} · Bass {formatNote(result.bass, 'unicode')}</p>
          <ul className="lab-chord-tones" aria-label="Chord tones from bass upwards">
            {result.tones.map((tone, index) => {
              const role = annotations[(index + inversion) % annotations.length]?.chordToneRole
              return <li key={index} data-role={role}><strong>{formatNote(tone, 'unicode')}</strong><span>{role}</span></li>
            })}
          </ul>
          <PlaybackControls input={props.input} options={[
            { label: 'Play chord', frames: playback.simultaneous },
            { label: 'Play arpeggio', frames: playback.sequential },
          ]} />
        </section>
      </div>
      <LabExplanation title="How it’s built">
        <p>{steps[0]?.text}</p>
        <ol className="lab-formula">
          {steps.map(({ interval, tone, voicedTone }, index) => (
            <li key={interval.number}>
              <strong>{annotations[index]?.chordToneRole}</strong>
              <span>{describeInterval(interval)} · {interval.halfSteps} H · {stepDistance(interval.halfSteps)}</span>
              <span>{formatNote(tone, 'unicode')}{tone.octave !== voicedTone.octave && ' voiced as ' + formatNote(voicedTone, 'unicode')}</span>
            </li>
          ))}
        </ol>
      </LabExplanation>
    </LabWorkspace>
  )
}
