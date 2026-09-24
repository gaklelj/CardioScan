import { getViewport } from './ecgViewport'

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
