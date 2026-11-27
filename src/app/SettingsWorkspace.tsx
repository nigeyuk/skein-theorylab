import { useSyncExternalStore } from 'react'
import type { KeyboardPreferences } from '../storage/keyboard-preferences'

const keyboardSettings = [
  { key: 'showNoteLabels', label: 'Show note labels', description: 'Display note names on the piano keys.' },
  { key: 'highlightMiddleC', label: 'Highlight middle C', description: 'Mark C4 when it is in the displayed range, even when note labels are off.' },
  { key: 'startCollapsed', label: 'Start with keyboard collapsed', description: 'Keep the keyboard closed on your next launch. You can open it from its header.' },
] as const

export function SettingsWorkspace({ keyboard, description }: { keyboard: KeyboardPreferences; description: string }) {
  const preferences = useSyncExternalStore(keyboard.subscribe, keyboard.getState, keyboard.getState)

  return (
    <section className="settings-workspace" aria-labelledby="workspace-title">
      <h1 id="workspace-title" tabIndex={-1}>Settings</h1>
      <p>{description}</p>
      <section className="settings-panel" aria-labelledby="virtual-keyboard-settings">
        <h2 id="virtual-keyboard-settings">Virtual Keyboard</h2>
        {keyboardSettings.map(({ key, label, description }) => (
          <label className="settings-option" key={key}>
            <span>{label}<small id={'keyboard-setting-' + key}>{description}</small></span>
            <input type="checkbox" checked={preferences[key]} aria-label={label} aria-describedby={'keyboard-setting-' + key}
              onChange={(event) => keyboard.update({ [key]: event.target.checked })} />
          </label>
        ))}
      </section>
    </section>
  )
}
