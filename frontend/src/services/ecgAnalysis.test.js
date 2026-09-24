import { analysisErrorMessage, readAnalysisResponse } from './ecgAnalysis'

const t = key => key

test.each([
  ['At least 10 seconds of ECG are required', 'ecgErrorTooShort'],
  ['Recording contains lost samples; repeat the recording', 'ecgErrorGaps'],
  ['Recording has gaps or invalid timing; repeat the recording', 'ecgErrorGaps'],
  ['Three-lead model is unavailable', 'ecgErrorModel'],
  ['Provide sample_rate_hz (50..25600) or complete timing metadata', 'ecgErrorTiming'],
  ['Failed to fetch', 'ecgErrorConnection'],
])('explains %s without an API-key warning', (message, key) => {
  expect(analysisErrorMessage(new Error(message), t)).toBe(key)
})

test('preserves unknown server errors', () => {
  expect(analysisErrorMessage(new Error('Unexpected model shape'), t)).toContain('Unexpected model shape')
})

test('handles HTTP errors with and without JSON', async () => {
  await expect(readAnalysisResponse({ ok: false, status: 503,
    json: async () => ({ error: 'Three-lead model is unavailable' }) })).rejects.toThrow('Three-lead model')
  await expect(readAnalysisResponse({ ok: false, status: 500,
    json: async () => ({}) })).rejects.toThrow('HTTP 500')
  await expect(readAnalysisResponse({ ok: false, status: 502,
    json: async () => { throw new Error('HTML response') } })).rejects.toThrow('HTTP 502')
})

test('returns successful local inference', async () => {
  const result = { class: 'NOISE', model: 'ecg_ads1293' }
  await expect(readAnalysisResponse({ ok: true, json: async () => result })).resolves.toEqual(result)
})
