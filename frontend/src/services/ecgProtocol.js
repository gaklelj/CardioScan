export { ECG_DARK_COLORS as CHANNEL_COLORS } from './ecgPalette'

export function parseEcgSample(input) {
  try {
    let values = input
    if (typeof values === 'string') {
      const line = values.trim()
      if (!line) return null
      values = line.startsWith('{') || line.startsWith('[') ? JSON.parse(line) : line.split(',')
      if (Array.isArray(values) && [6, 7].includes(values.length)) {
        if (values.some(v => !/^-?\d+$/.test(v.trim()))) return null
        values = values.slice(2, -1)
      }
    }
    if (values && !Array.isArray(values) && typeof values === 'object') {
      values = values.channels ?? (('ch1' in values || 'channel1' in values)
        ? [1, 2, 3].map(i => values[`ch${i}`] ?? values[`channel${i}`])
        : [values.value])
    }
    if (!Array.isArray(values)) values = [values]
    if (![1, 3, 4].includes(values.length)) return null
    if (values.some(v => !['number', 'string'].includes(typeof v) || String(v).trim() === '')) return null
    const numbers = values.map(Number)
    return numbers.every(Number.isFinite) ? numbers : null
  } catch { return null }
}
