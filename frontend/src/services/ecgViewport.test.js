import { displayTimeUs, getViewport, updateDisplayClock } from './ecgViewport'

test('aligns all leads to device time rather than stretching received points', () => {
  const view = getViewport([[10, 20, 30], [40, 50, 60], [-1, -2, -3]], [[0, 0], [1000000, 1], [2000000, 2]], 5)
  expect(view.x).toEqual([0.6, 0.8, 1])
  expect(view.series[2]).toEqual([-1, -2, -3])
  expect(view.timed).toBe(true)
})

test('clips the time window and preserves missing sample gaps', () => {
  const view = getViewport([[1, 2, 3, 4]], [[0, 0], [1000000, 1], [3000000, 3], [4000000, 4]], 2)
  expect(view.series[0]).toEqual([3, 4])
  expect(view.x).toEqual([0.5, 1])
  expect(getViewport([[1, 2]], [[0, 1], [1000000, 3]], 2).gaps).toEqual([false, true])
})

test('freezing the viewport leaves subsequent captured data outside the view', () => {
  const view = getViewport([[1, 2, 3, 4]], [[0, 0], [1000000, 1], [2000000, 2], [3000000, 3]], 2, 2)
  expect(view.series[0]).toEqual([1, 2])
  expect(view.x).toEqual([0.5, 1])
})

test('legacy input uses samples, handles empty input and sequence rollover', () => {
  expect(getViewport([[], [], []], [], 5).series).toEqual([[], [], []])
  const view = getViewport([Array.from({ length: 600 }, (_, i) => i)], [], 5)
  expect(view.timed).toBe(false)
  expect(view.series[0]).toHaveLength(500)
  expect(view.series[0][0]).toBe(100)
  expect(getViewport([[1, 2]], [[0, 0xffffffff], [1, 0]], 2).gaps).toEqual([false, false])
})

test.each([125, 853.333])('ten seconds represent device time at %s Hz', rate => {
  const count = Math.floor(20 * rate)
  const timing = Array.from({ length: count }, (_, i) => [i * 1e6 / rate, i, 0])
  const view = getViewport([timing.map((_, i) => i)], timing, 10)
  expect(view.endTime - view.startTime).toBe(10e6)
  expect(view.series[0].length).toBeGreaterThanOrEqual(Math.floor(10 * rate))
  const oneSecondApart = Math.round(rate)
  expect(view.x[oneSecondApart] - view.x[0]).toBeCloseTo(0.1, 3)
})

test('the clock advances during packet stalls without stretching samples', () => {
  const anchor = updateDisplayClock(null, 12e6, 1000)
  expect(displayTimeUs(anchor, 3000)).toBe(14e6)
  expect(updateDisplayClock(anchor, 13e6, 3000)).toBe(anchor)
  const view = getViewport([[1, 2, 3]], [[10e6, 0], [11e6, 1], [12e6, 2]], 10, 3, displayTimeUs(anchor, 3000))
  expect(view.x).toEqual([0.6, 0.7, 0.8])
  expect(getViewport([[1]], [[12e6, 0]], 10, 1, displayTimeUs(anchor, 12001)).series[0]).toEqual([])
})

test('initial data occupies only its real duration in a ten-second window', () => {
  const view = getViewport([[1, 2, 3]], [[5e6, 0], [6e6, 1], [7e6, 2]], 10, 3, 15e6)
  expect(view.x).toEqual([0, 0.1, 0.2])
})
