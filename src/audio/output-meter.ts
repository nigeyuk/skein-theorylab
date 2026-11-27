import type { OutputPeaks } from './index'

export function createOutputMeter(context: AudioContext, output: AudioNode) {
  const splitter = context.createChannelSplitter(2)
  const analysers = [context.createAnalyser(), context.createAnalyser()] as const
  const samples = new Float32Array(2048)
  output.connect(splitter)
  for (const [channel, analyser] of analysers.entries()) {
    analyser.fftSize = samples.length
    splitter.connect(analyser, channel)
  }

  function peak(analyser: AnalyserNode) {
    analyser.getFloatTimeDomainData(samples)
    let value = 0
    for (const sample of samples) value = Math.max(value, Math.abs(sample))
    return value
  }

  return {
    read(): OutputPeaks {
      return { left: peak(analysers[0]), right: peak(analysers[1]) }
    },
    dispose() {
      output.disconnect(splitter)
      splitter.disconnect()
      for (const analyser of analysers) analyser.disconnect()
    },
  }
}
