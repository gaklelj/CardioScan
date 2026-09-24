// Local ECG inference does not use an API key. Preserve the server's reason.
export async function readAnalysisResponse(response) {
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error(`HTTP ${response.status || 'unknown'}: invalid analysis response`)
  }
  if (!response.ok || data.error) {
    throw new Error(data.error || `HTTP ${response.status}: analysis failed`)
  }
  return data
}

export function analysisErrorMessage(error, t) {
  const message = error?.message || ''
  if (message.includes('At least 10 seconds')) return t('ecgErrorTooShort')
  if (/lost samples|gaps or invalid timing/i.test(message)) return t('ecgErrorGaps')
  if (/model.*(?:unavailable|not available)/i.test(message)) return t('ecgErrorModel')
  if (/sample_rate_hz|timing must contain/i.test(message)) return t('ecgErrorTiming')
  if (error instanceof TypeError || /Failed to fetch|NetworkError/i.test(message)) return t('ecgErrorConnection')
  return message ? `${t('errorInference')} ${message}` : t('errorInference')
}
