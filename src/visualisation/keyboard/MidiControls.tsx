import { useState, useSyncExternalStore } from 'react'
import type { AudioEngine } from '../../audio'
import type { MidiInput } from '../../midi'
import type { NoteInputManager } from '../../note-input'

export function MidiControls({ midi, input, audio }: { midi: MidiInput; input: NoteInputManager; audio: AudioEngine }) {
  const state = useSyncExternalStore(midi.subscribe, midi.getState, midi.getState)
  const policy = useSyncExternalStore(input.subscribePolicy, input.getMidiPolicy, input.getMidiPolicy)
  const [audioError, setAudioError] = useState(false)
  const { status, devices, connectedDevice, preferredDevice, channel, autoRange, deviceError } = state
  const preferredMissing = preferredDevice !== null && !devices.some(({ id }) => id === preferredDevice)
  const canDisable = status === 'ready' || status === 'requesting'

  let message: string
  if (!policy.input) message = 'MIDI input is disabled in this workspace.'
  else if (status === 'ready') {
    message = connectedDevice ? 'Connected · ' + connectedDevice.name
      : deviceError ? 'Could not open the MIDI input. Select the input again or reconnect it.'
      : preferredMissing ? 'Waiting for the preferred MIDI input.'
      : devices.length ? 'Connecting to MIDI input…' : 'No MIDI inputs detected.'
  } else {
    message = {
      disabled: 'MIDI is disabled.',
      unsupported: 'Web MIDI is unavailable in this browser or context.',
      requesting: 'Waiting for MIDI permission…',
      denied: 'MIDI permission was denied. Check browser permissions and try again.',
      error: 'MIDI access could not be started.',
    }[status]
  }

  function enable() {
    setAudioError(false)
    // Resume before the permission prompt consumes the click's user activation.
    void audio.resume().catch(() => setAudioError(true))
    void midi.enable()
  }

  return (
    <div className="midi-controls" role="group" aria-label="MIDI input controls">
      <p className="midi-status" role="status">{message}</p>
      {canDisable ? <button className="lab-button" type="button" onClick={midi.disable}>Disable MIDI</button>
        : status !== 'unsupported' && policy.input && <button className="lab-button" type="button" onClick={enable}>Enable MIDI</button>}
      {status === 'ready' && policy.input && (
        <>
          <label className="keyboard-setting">MIDI device
            <select value={preferredDevice ?? ''} onChange={(event) => midi.selectDevice(event.target.value || null)}>
              <option value="">First available</option>
              {preferredMissing && <option value={preferredDevice}>Preferred input unavailable</option>}
              {devices.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="keyboard-setting">MIDI channel
            <select value={channel ?? ''} onChange={(event) => midi.setChannel(event.target.value ? Number(event.target.value) : null)}>
              <option value="">All</option>
              {Array.from({ length: 16 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
            </select>
          </label>
          {policy.feedback && (
            <label className="keyboard-setting">
              <input type="checkbox" checked={autoRange} onChange={(event) => midi.setAutoRange(event.target.checked)} /> Follow MIDI octaves
            </label>
          )}
        </>
      )}
      <button className="lab-button" type="button" onClick={() => { midi.resetNotes(); input.panic() }}>All notes off</button>
      {audioError && <p role="status">Audio could not start. Press a piano key to try again.</p>}
    </div>
  )
}
