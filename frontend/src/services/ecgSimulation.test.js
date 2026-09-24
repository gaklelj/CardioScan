import { DEMO_RATE, simulatedSample } from './ecgSimulation'
import { getViewport } from './ecgViewport'

test('demo produces four finite leads with a derived third lead and real ten-second scale', () => {
  const samples = Array.from({ length: DEMO_RATE * 12 + 1 }, (_, i) => simulatedSample(i))
  samples.forEach(([a, b, c, d]) => {
    expect([a, b, c, d].every(Number.isFinite)).toBe(true)
    expect(c).toBe(b - a)
  })
  const channels = [0, 1, 2, 3].map(lead => samples.map(sample => sample[lead]))
  const timing = samples.map((_, i) => [i * 1e6 / DEMO_RATE, i, 0])
  const view = getViewport(channels, timing, 10)
  expect(view.series[0]).toHaveLength(DEMO_RATE * 10 + 1)
  expect(view.endTime - view.startTime).toBe(10e6)
})
