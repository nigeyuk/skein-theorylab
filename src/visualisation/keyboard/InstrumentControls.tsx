import { useState, useSyncExternalStore } from 'react'
import { instrumentGainRange } from '../../audio'
import type { InstrumentControls as Controls } from '../../audio'

export function InstrumentControls({ controls, onChange }: { controls: Controls; onChange(): void }) {
  const { selectedId, status, loaded, total, gainDb } = useSyncExternalStore(controls.subscribe, controls.getState, controls.getState)
  const [audioError, setAudioError] = useState(false)
  const credits = controls.options.find(({ id }) => id === selectedId)?.creditsUrl
  const gainLabel = (gainDb > 0 ? '+' : '') + gainDb + ' dB'

  function select(id: string) {
    setAudioError(false)
    onChange()
    void controls.select(id).catch(() => setAudioError(true))
  }

  return (
    <div className="instrument-controls">
      <label className="keyboard-setting">Instrument
        <select value={selectedId} onChange={(event) => select(event.target.value)}>
          {controls.options.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}
        </select>
      </label>
      <div className="lab-button-row" role="group" aria-label="Instrument gain controls">
        <label className="keyboard-setting">Instrument gain
          <input type="range" min={instrumentGainRange.min} max={instrumentGainRange.max} value={gainDb}
            aria-valuetext={gainLabel} onChange={(event) => controls.setGainDb(Number(event.target.value))} />
        </label>
        <span className="instrument-gain-value">{gainLabel}</span>
        <button className="lab-button" type="button" disabled={gainDb === instrumentGainRange.default}
          onClick={() => controls.setGainDb(instrumentGainRange.default)}>Reset gain</button>
      </div>
      <div className="instrument-status" role="status">
        {audioError ? 'Audio could not start. Try playing a note.' : {
          idle: 'Play a note to load samples.',
          loading: total ? 'Loading samples ' + loaded + ' of ' + total + ' · playing synth' : 'Loading instrument · playing synth',
          ready: 'Ready',
          error: 'Samples unavailable · playing synth',
        }[status]}
      </div>
      {credits && <a className="instrument-credits" href={credits} target="_blank" rel="noreferrer">Sample credits</a>}
      {status === 'loading' && <progress aria-label="Instrument loading progress" max={total || 1} value={total ? loaded : undefined} />}
      {status === 'error' && <button className="lab-button" type="button" onClick={() => select(selectedId)}>Retry samples</button>}
    </div>
  )
}
