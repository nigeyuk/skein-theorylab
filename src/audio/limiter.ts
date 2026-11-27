export const outputCeiling = 0.95

/** Scale the shaper's input domain to cover peaks above unity before applying the ceiling. */
export function createOutputLimiter(context: AudioContext) {
  const input = context.createGain()
  const output = context.createWaveShaper()
  const inputRange = 4
  const knee = 0.8
  const headroom = outputCeiling - knee
  const curve = new Float32Array(8193)
  for (let index = 0; index < curve.length; index++) {
    const signal = inputRange * (2 * index / (curve.length - 1) - 1)
    const magnitude = Math.abs(signal)
    const limited = magnitude <= knee ? magnitude : knee + headroom * Math.tanh((magnitude - knee) / headroom)
    curve[index] = Math.sign(signal) * limited
  }
  input.gain.value = 1 / inputRange
  output.channelCount = 2
  output.channelCountMode = 'explicit'
  output.channelInterpretation = 'speakers'
  output.curve = curve
  input.connect(output)
  return { input, output }
}
