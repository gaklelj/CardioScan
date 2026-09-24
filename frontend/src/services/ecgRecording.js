// Keep the complete recording for history; bound only the inference request.
export function analysisWindow(channels, timing, sampleRateHz) {
  const count = channels[0]?.length ?? 0
  let start = 0
  if (timing.length === count && count > 0) {
    const cutoff = timing[count - 1][0] - 11e6
    let end = count
    while (start < end) {
      const mid = Math.floor((start + end) / 2)
      if (timing[mid][0] < cutoff) start = mid + 1
      else end = mid
    }
  } else if (sampleRateHz > 0) {
    start = Math.max(0, count - Math.ceil(11 * sampleRateHz))
  }
  return {
    channels: channels.slice(0, 3).map(channel => channel.slice(start)),
    timing: timing.length === count && count > 0 ? timing.slice(start) : undefined,
  }
}
