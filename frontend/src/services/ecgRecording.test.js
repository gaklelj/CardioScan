import { analysisWindow } from './ecgRecording'
import { getViewport } from './ecgViewport'

test('a minute of four-lead recording survives chart and analysis window selection', () => {
  const channels = [0, 1, 2, 3].map(lead => Array.from({ length: 6000 }, (_, i) => lead * 10000 + i))
  const timing = channels[0].map((_, i) => [i * 10000, i, 0])
  const view = getViewport(channels, timing, 5)
  expect(view.series).toHaveLength(4)
  expect(view.series[3]).toHaveLength(501)
  const request = analysisWindow(channels, timing, 100)
  expect(request.channels).toHaveLength(3)
  expect(request.channels[0]).toHaveLength(1101)
  expect(request.channels[2].at(-1)).toBe(25999)
  expect(request.timing).toHaveLength(1101)
  expect(channels.every(channel => channel.length === 6000)).toBe(true)
  expect(timing).toHaveLength(6000)
})

test('short recordings and legacy input are preserved without manufacturing timing', () => {
  expect(analysisWindow([[1, 2]], [], undefined)).toEqual({ channels: [[1, 2]], timing: undefined })
  expect(analysisWindow([[1], [2], [1], [4]], [[10, 0, 0]], 100).channels).toEqual([[1], [2], [1]])
})
