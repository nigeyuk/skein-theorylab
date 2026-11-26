export type MidiMessage =
  | { readonly kind: 'note-on'; readonly channel: number; readonly note: number; readonly velocity: number }
  | { readonly kind: 'note-off'; readonly channel: number; readonly note: number }
  | { readonly kind: 'sustain'; readonly channel: number; readonly down: boolean }
  | { readonly kind: 'all-notes-off'; readonly channel: number }

export function decodeMidiMessage(data: ArrayLike<number>): MidiMessage | undefined {
  if (data.length !== 3) return undefined
  const [status, first, value] = Array.from(data)
  if (status === undefined || first === undefined || value === undefined
    || status < 0x80 || status > 0xef || first < 0 || first > 127 || value < 0 || value > 127) return undefined
  const type = status & 0xf0
  const channel = (status & 0x0f) + 1
  if (type === 0x90 && value > 0) return { kind: 'note-on', channel, note: first, velocity: value / 127 }
  if (type === 0x80 || type === 0x90) return { kind: 'note-off', channel, note: first }
  if (type === 0xb0 && first === 64) return { kind: 'sustain', channel, down: value >= 64 }
  if (type === 0xb0 && (first === 120 || first === 123)) return { kind: 'all-notes-off', channel }
  return undefined
}
