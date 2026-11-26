/** Keep over-budget peaks below full scale while leaving ordinary signals untouched. */
export function createOutputLimiter(context: AudioContext): WaveShaperNode {
  const limiter = context.createWaveShaper()
  const curve = new Float32Array(2049)
  for (let index = 0; index < curve.length; index++) {
    const input = 2 * index / (curve.length - 1) - 1
    const magnitude = Math.abs(input)
    const over = Math.max(0, magnitude - 0.85)
    curve[index] = Math.sign(input) * (Math.min(magnitude, 0.85) + over / (1 + over * 2))
  }
  limiter.curve = curve
  return limiter
}
