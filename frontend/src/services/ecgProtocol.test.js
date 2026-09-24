import { parseEcgSample } from './ecgProtocol'

test('preserves V1 from seven-field firmware and backend frames', () => {
  expect(parseEcgSample('1200000,42,8388610,8388600,-10,8388620,3\r')).toEqual([8388610, 8388600, -10, 8388620])
  expect(parseEcgSample({ channels: [1, 2, 1, 4] })).toEqual([1, 2, 1, 4])
})

test('reads actual six-field firmware frames without plotting timestamps', () => {
  expect(parseEcgSample('1200000,42,8388610,8388600,-10,3\r')).toEqual([8388610, 8388600, -10])
})

test('accepts complete samples and preserves legacy channel count', () => {
  expect(parseEcgSample({ channels: [1, 2, 3] })).toEqual([1, 2, 3])
  expect(parseEcgSample('{"ch1":1,"ch2":2,"ch3":3}')).toEqual([1, 2, 3])
  expect(parseEcgSample({ value: 12 })).toEqual([12])
})

test.each(['', '1,2', '1,,3', '1,2,NaN', '123 booting', '{"channels":[1,null,3]}',
  'timestamp_us,sequence,lead_I_raw,lead_II_raw,lead_III_raw,lost_samples'])('rejects invalid input %s', input => {
  expect(parseEcgSample(input)).toBeNull()
})
