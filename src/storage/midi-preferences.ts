const key = 'skein-theorylab:midi-input'

export const midiPreferences = {
  load() {
    try { return localStorage.getItem(key) } catch { return null }
  },
  save(deviceId: string | null) {
    try {
      if (deviceId === null) localStorage.removeItem(key)
      else localStorage.setItem(key, deviceId)
    } catch {
      // Private mode and storage policies can block persistence while MIDI still works.
    }
  },
}
