import type { InstrumentDefinition } from './instrument'
import { createVoiceBank } from './voice-bank'

export const oscillatorInstrument: InstrumentDefinition = {
  id: 'synth',
  label: 'Triangle synthesiser',
  create(context, output) {
    return {
      async load() {},
      ...createVoiceBank(context, output, {
        attack: 0.012, release: 0.065, voiceGain: 0.12, maxPolyphony: 24, steal: false,
        source({ hertz, start }) {
          const oscillator = context.createOscillator()
          oscillator.type = 'triangle'
          oscillator.frequency.setValueAtTime(hertz, start)
          return oscillator
        },
      }),
    }
  },
}
