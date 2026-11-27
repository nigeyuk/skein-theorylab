import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../../audio'

const floorDb = -60

function peakDb(peak: number) {
  return Math.max(floorDb, Math.round(20 * Math.log10(peak)))
}

export function OutputMeter({ audio }: { audio: AudioEngine }) {
  const left = useRef<HTMLMeterElement>(null)
  const right = useRef<HTMLMeterElement>(null)

  useEffect(() => {
    let frame: number
    function update() {
      const peaks = audio.readOutputPeaks()
      if (left.current) left.current.value = peakDb(peaks.left)
      if (right.current) right.current.value = peakDb(peaks.right)
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [audio])

  return (
    <div className="keyboard-output-meter" role="group" aria-label="Stereo output peaks in dBFS">
      <span>Output</span>
      <span aria-hidden="true">L</span><meter ref={left} aria-label="Left output peak" min={floorDb} max={0} value={floorDb} />
      <span aria-hidden="true">R</span><meter ref={right} aria-label="Right output peak" min={floorDb} max={0} value={floorDb} />
    </div>
  )
}
