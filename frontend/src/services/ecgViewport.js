// Keep device time as the common x-axis. Never bridge missing sequence numbers.
export function getViewport(channels, timing, seconds, endIndex = channels[0]?.length ?? 0, clockTimeUs) {
  const end = Math.min(endIndex, channels[0]?.length ?? 0)
  const timed = end > 0 && timing.length >= end
  const lastTime = timed ? timing[end - 1][0] : 0
  const endTime = timed && Number.isFinite(clockTimeUs) ? Math.max(lastTime, clockTimeUs) : lastTime
  const startTime = endTime - seconds * 1e6
  let start = Math.max(0, end - 500)
  if (timed) {
    let lo = 0, hi = end
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (timing[mid][0] < startTime) lo = mid + 1
      else hi = mid
    }
    start = lo
  }
  const series = channels.map(ch => ch.slice(start, end))
  const x = series[0]?.map((_, i) => timed
    ? (timing[start + i][0] - startTime) / (seconds * 1e6)
    : i / 499) ?? []
  const gaps = x.map((_, i) => timed && i > 0 &&
    ((timing[start + i][1] - timing[start + i - 1][1]) >>> 0) !== 1)
  return { series, x, gaps, timed, startTime, endTime }
}

// Keep time moving between packets. Re-anchor only if the device catches up
// beyond the projected clock; delayed batches must not slow the display down.
export function updateDisplayClock(previous, timestampUs, receivedAtMs) {
  if (!previous || timestampUs > displayTimeUs(previous, receivedAtMs)) {
    return { deviceUs: timestampUs, receivedAtMs }
  }
  return previous
}

export function displayTimeUs(anchor, nowMs) {
  return anchor ? anchor.deviceUs + Math.max(0, nowMs - anchor.receivedAtMs) * 1000 : undefined
}
