export function int16ToPeaks(samples: Int16Array, buckets = 200): number[] {
  const count = Math.max(1, Math.floor(buckets))
  const out = new Array<number>(count).fill(0)
  const total = samples.length
  if (total === 0) return out

  const per = total / count
  for (let b = 0; b < count; b++) {
    const start = Math.floor(b * per)
    const end = Math.min(total, Math.floor((b + 1) * per))
    let max = 0
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i] || 0)
      if (v > max) max = v
    }
    out[b] = Math.min(1, max / 32768)
  }
  return out
}

export function clampWaveformPoints(points: number[] | null | undefined): number[] {
  if (!Array.isArray(points) || points.length === 0) return []
  return points.map((p) => {
    if (!Number.isFinite(p)) return 0
    return Math.min(1, Math.max(0, p))
  })
}
