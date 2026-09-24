import { analysisErrorMessage, readAnalysisResponse } from '../services/ecgAnalysis'
import { parseEcgSample } from '../services/ecgProtocol'
import { analysisWindow, recordedSeconds } from '../services/ecgRecording'
import { updateDisplayClock } from '../services/ecgViewport'
import { DEMO_RATE, DEMO_BPM, simulatedSample } from '../services/ecgSimulation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { CloudOff, Upload } from 'lucide-react'
import EcgScope from './EcgScope'
import MonitorPanel from './MonitorPanel'
import { useLanguage } from '../LanguageContext'
import SymptomsModal, { SymptomsCard } from './SymptomsModal'
import RiskAssessmentCard from './RiskAssessmentCard'
import PatientDataStatus from './PatientDataStatus'
import { canAssessRisk } from '../services/patientData'
import useHistoryStore from '../store/useHistoryStore'
import { saveRecord } from '../services/historyDB'

const isMobileDevice = /Android|iPhone|iPad/i.test(navigator.userAgent)
// Десктоп → локальный бэкенд (он и читает USB/WiFi сам)
// Мобайл  → VPS
const BACKEND     = isMobileDevice
  ? 'http://localhost:6767'
  : 'http://localhost:6767'
const SOCKET_PATH = isMobileDevice ? '/socket.io' : '/socket.io'
const ANALYZE_URL = isMobileDevice
  ? 'http://localhost:6767/api/ecg/analyze'
  : 'http://localhost:6767/api/ecg/analyze'
const OFFLINE_KEY = 'ecg_offline_buffer'
const CHANNEL_COUNT = 4

const CLASS_COLORS = {
  'Normal':              '#22c55e',
  'Atrial Fibrillation': '#f97316',
  'ST-elevation':        '#ef4444',
  'ST-depression':       '#f59e0b',
  'Other':               '#a78bfa',
  'Noise':               '#6b7280',
}

export default function EcgRealtime() {
  const { t } = useLanguage()

  const [connMode,        setConnMode]        = useState('wifi')
  const [serverOnline,    setServerOnline]    = useState(false)
  const [deviceConnected, setDeviceConnected] = useState(false)
  const [deviceInfo,      setDeviceInfo]      = useState(null)
  const [scanStatus,      setScanStatus]      = useState('idle')
  const [streamInfo, setStreamInfo] = useState(null)
  const [streamError, setStreamError] = useState('')
  const timingRef = useRef([])
  const displayClockRef = useRef(null)
  const streamInfoRef = useRef(null)
  const [duration,        setDuration]        = useState(0)
  const [sampleCount,     setSampleCount]     = useState(0)
  const [heartRate,       setHeartRate]       = useState(null)
  const [aiStatus,        setAiStatus]        = useState('idle')
  const [aiResult,        setAiResult]        = useState(null)
  const [analysisError, setAnalysisError] = useState(null)
  const [savingRecord, setSavingRecord] = useState(false)
  const [resultAtSeconds, setResultAtSeconds] = useState(null)
  const analysisRequestRef = useRef(null)
  const liveAnalysisRef = useRef(null)
  const lastAnalysisAtRef = useRef(-Infinity)
  const lastAnalysisCountRef = useRef(0)
  const latestResultRef = useRef(null)
  const [isOnline,        setIsOnline]        = useState(navigator.onLine)
  const [offlineCount,    setOfflineCount]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]').length } catch { return 0 }
  })
  const [flushStatus, setFlushStatus] = useState('idle')
  const [showSymptoms, setShowSymptoms] = useState(false)
  const [symptoms, setSymptoms]         = useState(null)
  const [riskData, setRiskData]         = useState(null)
  const [riskLoading, setRiskLoading]   = useState(false)

  const { add: addToHistory } = useHistoryStore()
  const historyId = useRef(null)
  const [historyVersion, setHistoryVersion] = useState(0)

  // Update history record when aiResult arrives
  useEffect(() => {
    if (!aiResult || !historyId.current) return
    const store = useHistoryStore.getState()
    const rec = store.records.find(r => r.id === historyId.current)
    if (!rec) return
    const updated = { ...rec, modelResult: aiResult }
    saveRecord(updated)
    useHistoryStore.setState(s => ({ records: s.records.map(r => r.id === historyId.current ? updated : r) }))
  }, [aiResult, historyVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update history record when riskData arrives
  useEffect(() => {
    if (!symptoms || !historyId.current) return
    const store = useHistoryStore.getState()
    const rec = store.records.find(r => r.id === historyId.current)
    if (!rec) return
    const updated = { ...rec, riskData, demographics: symptoms.demographics, symptoms: symptoms.readable, roseFlag: symptoms.roseFlag, questionnaireVersion: 2 }
    saveRecord(updated)
    useHistoryStore.setState(s => ({ records: s.records.map(r => r.id === historyId.current ? updated : r) }))
  }, [riskData, symptoms, historyVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch risk assessment when both symptoms + ECG result are available
  useEffect(() => {
    setRiskData(null)
    setRiskLoading(false)
    if (!canAssessRisk(symptoms) || !aiResult?.all || aiResult.model === 'ecg_ads1293' || aiResult.simulated) return
    const controller = new AbortController()
    setRiskLoading(true)
    const ecg = aiResult.all
    fetch(`${BACKEND}/api/risk-assessment`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ecg_probabilities: ecg,
        demographics: symptoms.demographics,
        rose_flag: symptoms.roseFlag,
      }),
    })
      .then(r => r.json())
      .then(data => { if (data.risk_class) setRiskData(data); else setRiskLoading(false) })
      .catch(() => setRiskLoading(false))
      .finally(() => setRiskLoading(false))
    return () => controller.abort()
  }, [symptoms, aiResult])

  const socketRef     = useRef(null)
  const recordingRef = useRef([[], [], [], []])
  const scanStatusRef = useRef('idle')
  const timerRef      = useRef(null)
  const demoTimerRef = useRef(null)
  const connModeRef   = useRef('wifi')
  const stopScanRef = useRef(null)
  const startedAtRef = useRef(null)

  /* ─── Canvas ────────────────────────────────────────────────────── */
  useEffect(() => {
    const transports = ['polling']
    const socket = io(BACKEND, { path: SOCKET_PATH, transports })
    socketRef.current = socket

    socket.on('connect', () => {
      setServerOnline(true)
      if (connModeRef.current !== 'demo') socket.emit('check_ecg_device', { mode: connModeRef.current })
    })
    socket.on('disconnect', () => {
      setServerOnline(false); setDeviceConnected(false)
      if (connModeRef.current !== 'demo') stopScanRef.current?.()
    })
    socket.on('device_status', (data) => {
      if (connModeRef.current === 'demo') return
      if (!data.connected) stopScanRef.current?.()
      setDeviceConnected(data.connected)
      setDeviceInfo(data.connected ? data : null)
    })
    const receivePoint = (data) => {
      if (scanStatusRef.current !== 'scanning' || connModeRef.current === 'demo') return
      const channels = parseEcgSample(data)
      if (!channels) return
      if (recordingRef.current[0].length && channels.length !== recordingRef.current.filter(ch => ch.length).length) return
      channels.slice(0, CHANNEL_COUNT).forEach((value, index) => {
        recordingRef.current[index].push(value)
      })
      if (data.timestamp_us !== undefined) {
        timingRef.current.push([data.timestamp_us, data.sequence, data.lost_samples])
        displayClockRef.current = updateDisplayClock(displayClockRef.current, data.timestamp_us, performance.now())
      }
      if (data.heart_rate) setHeartRate(data.heart_rate)
    }
    socket.on('ecg_point', data => { receivePoint(data); setSampleCount(recordingRef.current[0].length) })
    socket.on('ecg_frames', data => {
      if (scanStatusRef.current !== 'scanning' || connModeRef.current === 'demo') return
      data.frames.forEach(receivePoint)
      streamInfoRef.current = data
      setStreamInfo(data)
      setSampleCount(recordingRef.current[0].length)
    })
    socket.on('ecg_error', data => { if (connModeRef.current === 'demo') return; setStreamError(data.error); stopScanRef.current?.() })
    socket.on('ecg_analysis', (data) => {
      if (scanStatusRef.current === 'scanning' && connModeRef.current !== 'demo') { setAiResult(data); setAiStatus('done') }
    })

    const onOnline  = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      clearInterval(timerRef.current)
      clearInterval(demoTimerRef.current)
      analysisRequestRef.current?.abort()
      analysisRequestRef.current = null
      if (connModeRef.current !== 'demo') socket.emit('stop_ecg')
      socket.disconnect()
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  /* ─── Анализ через REST ─────────────────────────────────────────── */
  const analyzePoints = useCallback(async (channels, final = false) => {
    if (analysisRequestRef.current && !final) return
    if (final) analysisRequestRef.current?.abort()
    const window = analysisWindow(channels, timingRef.current, streamInfoRef.current?.sample_rate_hz)
    const points = window.channels[0] ?? []
    if (!points.length) return
    const controller = new AbortController()
    analysisRequestRef.current = controller
    lastAnalysisAtRef.current = performance.now()
    lastAnalysisCountRef.current = channels[0].length
    const resultTime = recordedSeconds(channels, timingRef.current, streamInfoRef.current?.sample_rate_hz)
    setAiStatus('analyzing')
    setAnalysisError(null)
    try {
      const res  = await fetch(ANALYZE_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, channels: window.channels,
          sample_rate_hz: streamInfoRef.current?.sample_rate_hz,
          timing: window.timing,
          // Complete per-sample timing is validated for this window by the
          // backend; losses before it must not poison all later live windows.
          missing_samples: window.timing ? 0 : streamInfoRef.current?.missing_samples ?? 0 }),
      })
      const data = await readAnalysisResponse(res)
      if (analysisRequestRef.current !== controller) return
      latestResultRef.current = data
      setResultAtSeconds(resultTime)
      setAiResult(data); setAiStatus('done')
    } catch (error) {
      if (analysisRequestRef.current === controller && error.name !== 'AbortError') {
        setAiStatus('error'); setAnalysisError(error)
      }
    } finally {
      if (analysisRequestRef.current === controller) analysisRequestRef.current = null
    }
  }, [])

  liveAnalysisRef.current = () => {
    if (connModeRef.current === 'demo') return
    if (scanStatusRef.current !== 'scanning' || analysisRequestRef.current) return
    if (performance.now() - lastAnalysisAtRef.current < 2000) return
    const channels = recordingRef.current.filter(channel => channel.length)
    if (channels[0]?.length === lastAnalysisCountRef.current) return
    if (channels.length < 3 || recordedSeconds(channels, timingRef.current, streamInfoRef.current?.sample_rate_hz) < 10) return
    analyzePoints(channels)
  }

  /* ─── Старт / стоп ──────────────────────────────────────────────── */
  const startScan = () => {
    if (scanStatusRef.current === 'scanning') return
    startedAtRef.current = Date.now()
    analysisRequestRef.current?.abort()
    analysisRequestRef.current = null
    lastAnalysisAtRef.current = -Infinity
    lastAnalysisCountRef.current = 0
    latestResultRef.current = null
    setResultAtSeconds(null)
    recordingRef.current = [[], [], [], []]
    timingRef.current = []
    displayClockRef.current = null
    streamInfoRef.current = null
    setStreamInfo(null)
    setStreamError('')
    historyId.current = null
    setSampleCount(0); setDuration(0); setHeartRate(null)
    setAiResult(null); setAiStatus('idle'); setAnalysisError(null)
    setSymptoms(null); setShowSymptoms(false)
    setRiskData(null); setRiskLoading(false)
    setScanStatus('scanning'); scanStatusRef.current = 'scanning'
    if (connModeRef.current === 'demo') {
      const began = performance.now()
      displayClockRef.current = { deviceUs: 0, receivedAtMs: began }
      setHeartRate(DEMO_BPM)
      const appendDemo = () => {
        const target = Math.floor((performance.now() - began) * DEMO_RATE / 1000) + 1
        // Bound recovery work when the tab resumes after a long suspension.
        // Keep sequence/time gaps visible instead of freezing the browser.
        const previous = timingRef.current.at(-1)?.[1] ?? -1
        const first = Math.max(previous + 1, target - DEMO_RATE * 10)
        for (let i = first; i < target; i++) {
          simulatedSample(i).forEach((value, lead) => recordingRef.current[lead].push(value))
          timingRef.current.push([i * 1e6 / DEMO_RATE, i, 0])
        }
        const info = { sample_rate_hz: DEMO_RATE, missing_samples: target - recordingRef.current[0].length, frames: [{ lost_samples: 0 }] }
        streamInfoRef.current = info
        setStreamInfo(info)
        setSampleCount(recordingRef.current[0].length)
      }
      appendDemo()
      demoTimerRef.current = setInterval(appendDemo, 40)
    } else {
      socketRef.current?.emit('start_ecg', { mode: connModeRef.current })
    }
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startedAtRef.current) / 1000))
      liveAnalysisRef.current?.()
    }, 1000)
  }

  const stopScan = async () => {
    if (scanStatusRef.current !== 'scanning') return
    const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000)
    setDuration(elapsed)
    clearInterval(timerRef.current)
    clearInterval(demoTimerRef.current)
    if (connModeRef.current !== 'demo') socketRef.current?.emit('stop_ecg')
    setScanStatus('done'); scanStatusRef.current = 'done'
    if (connModeRef.current === 'demo') return

    const channels = recordingRef.current.filter(channel => channel.length).map(channel => [...channel])
    if (!channels.length) { setAiStatus('idle'); return }
    setAiStatus('analyzing')
    setSavingRecord(true)

    // Save record to history immediately with points; model result will be updated via socket/analyzePoints
    historyId.current = null
    try {
      const rec = await addToHistory({
        type:        'live',
        modelResult: latestResultRef.current,
        aiSummary: null,
        ecgPoints:   channels[0],
        ecgChannels: channels,
        ecgTiming: [...timingRef.current],
        sampleRateHz: streamInfoRef.current?.sample_rate_hz ?? null,
        missingSamples: streamInfoRef.current?.missing_samples ?? 0,
        leadLabels: (timingRef.current.length ? ['I', 'II', 'III (II - I)', 'V1'] : ['CH1', 'CH2', 'CH3', 'CH4']).slice(0, channels.length),
        connMode:    connModeRef.current,
        duration: elapsed,
        sampleCount: channels[0].length,
        heartRate:   heartRate ?? null,
      })
      historyId.current = rec.id
      setHistoryVersion(v => v + 1)
    } catch (error) {
      setStreamError(String(error))
    } finally {
      setSavingRecord(false)
    }
    analyzePoints(channels, true)
  }

  stopScanRef.current = stopScan

  /* ─── Отправить офлайн-буфер ────────────────────────────────────── */
  const flushOffline = async () => {
    try {
      const stored = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]')
      if (!stored.length) return
      setFlushStatus('flushing')
      const res  = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: Array.isArray(stored[0]) ? stored[0] : stored, channels: Array.isArray(stored[0]) ? stored : undefined }),
      })
      const data = await res.json()
      if (!data.error) {
        setAiResult(data); setAiStatus('done')
        localStorage.removeItem(OFFLINE_KEY)
        setOfflineCount(0)
        setFlushStatus('done')
      } else { setFlushStatus('error') }
    } catch { setFlushStatus('error') }
  }

  const handleModeChange = (mode) => {
    if (scanStatus === 'scanning' || savingRecord || !['wifi', 'usb', 'demo'].includes(mode)) return
    analysisRequestRef.current?.abort()
    analysisRequestRef.current = null
    setAiResult(null); setAiStatus('idle'); setAnalysisError(null)
    latestResultRef.current = null
    historyId.current = null
    setResultAtSeconds(null)
    recordingRef.current = [[], [], [], []]
    timingRef.current = []
    displayClockRef.current = null
    streamInfoRef.current = null
    setStreamInfo(null); setStreamError('')
    setSampleCount(0); setDuration(0); setHeartRate(null)
    setScanStatus('idle'); scanStatusRef.current = 'idle'
    setSymptoms(null); setRiskData(null); setShowSymptoms(false)
    setConnMode(mode)
    connModeRef.current = mode
    setDeviceConnected(false)
    setDeviceInfo(null)
    if (mode !== 'demo') socketRef.current?.emit('check_ecg_device', { mode })
  }

  const canStart = (connMode === 'demo' || serverOnline) && scanStatus !== 'scanning' && aiStatus !== 'analyzing' && !savingRecord
  return (
    <div className="space-y-3">

      <MonitorPanel mode={connMode} changeMode={handleModeChange} serverOnline={serverOnline}
        deviceConnected={deviceConnected} deviceInfo={deviceInfo} status={scanStatus}
        duration={duration} sampleCount={sampleCount} streamInfo={streamInfo} canStart={canStart}
        start={startScan} stop={stopScan} error={streamError}>
        <EcgScope recordingRef={recordingRef} timingRef={timingRef} displayClockRef={displayClockRef} status={scanStatus} mode={connMode} sampleCount={sampleCount} />
      </MonitorPanel>
      {connMode !== 'demo' && offlineCount > 0 && (
        <div className="border rounded-2xl p-4 flex items-center justify-between gap-3"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
          <div className="flex items-center gap-2">
            <CloudOff size={13} style={{ color: '#f59e0b' }} />
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
              {offlineCount} точек сохранено офлайн
            </span>
          </div>
          <button
            onClick={flushOffline}
            disabled={!isOnline || flushStatus === 'flushing'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-40"
            style={{ background: 'var(--c-accent)', color: 'var(--c-accent-fg)' }}
          >
            <Upload size={11} />
            {flushStatus === 'flushing' ? 'Отправка...' : 'Отправить на анализ'}
          </button>
        </div>
      )}

      {/* Результат AI */}
      {connMode !== 'demo' && (
        <div className="border rounded-2xl overflow-hidden animate-fade-in"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--c-dim)' }}>{t('result')} / {aiResult?.analysis_channel ?? 'I, II, III'}</p>
            {aiStatus === 'analyzing' && (
              <span className="text-xs flex items-center gap-2" style={{ color: 'var(--c-dim)' }}>
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                {t('analyzingEcg')}
              </span>
            )}
          </div>
          <div className="p-4">
            {aiStatus === 'idle' && <p className="text-sm" role="status">{t('ecgAwaitingAnalysis')}</p>}
            {aiResult && resultAtSeconds !== null && <p className="text-xs mb-3" role="status">{t('ecgLastAnalysis')}: {resultAtSeconds.toFixed(1)} {t('ecgSecondsUnit')}</p>}
            {aiStatus === 'analyzing' && !aiResult && (
              <div className="flex justify-center py-8">
                <svg className="animate-spin w-6 h-6" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--c-dim)' }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              </div>
            )}
            {aiResult && (
              <div className="space-y-3">
                {aiResult.model === 'ecg_ads1293' && <p className="text-xs" style={{ color: 'var(--c-dim)' }}>{t('ecgModelScore')}</p>}
                {aiResult.class === 'NOISE' && <p className="text-sm" style={{ color: '#f59e0b' }}>{t('ecgRepeatNoise')}</p>}
                <div className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{
                    background: `${CLASS_COLORS[aiResult.class] ?? '#6b7280'}18`,
                    border: `1px solid ${CLASS_COLORS[aiResult.class] ?? '#6b7280'}44`,
                  }}>
                  <span className="font-semibold text-sm" style={{ color: CLASS_COLORS[aiResult.class] ?? 'var(--c-text)' }}>
                    {aiResult.labels?.join(', ') || aiResult.class}
                  </span>
                  <span className="text-sm font-mono font-medium" style={{ color: CLASS_COLORS[aiResult.class] ?? 'var(--c-text)' }}>
                    {`${(aiResult.confidence * 100).toFixed(1)}%`}
                  </span>
                </div>
                {aiResult.all && aiResult.class !== 'NOISE' && (
                  <div className="space-y-1.5">
                    {Object.entries(aiResult.all).sort(([, a], [, b]) => b - a).map(([cls, conf]) => (
                      <div key={cls} className="flex items-center gap-2">
                        <span className="text-xs w-36 shrink-0 truncate" style={{ color: 'var(--c-dim)' }}>{cls}</span>
                        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${(conf * 100).toFixed(1)}%`, background: CLASS_COLORS[cls] ?? '#6b7280' }} />
                        </div>
                        <span className="text-xs font-mono w-10 text-right shrink-0" style={{ color: 'var(--c-dim)' }}>
                          {(conf * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {aiStatus === 'error' && (
              <p className="text-sm text-center py-4" style={{ color: 'var(--c-warn-text)' }}>{analysisErrorMessage(analysisError, t)}</p>
            )}
          </div>
        </div>
      )}

      {connMode !== 'demo' && <button type="button" className="scope-tool" onClick={() => setShowSymptoms(true)}>{t('ecgOpenQuestionnaire')}</button>}

      {symptoms?.readable?.length > 0 && (
        <SymptomsCard symptoms={symptoms.readable} t={t} />
      )}
      <RiskAssessmentCard riskData={riskData} loading={riskLoading} t={t} />
      {connMode !== 'demo' && <PatientDataStatus questionnaire={symptoms} t={t} />}

      <SymptomsModal
        open={showSymptoms}
        onClose={() => setShowSymptoms(false)}
        onSubmit={(data) => {
          setSymptoms(data)
        }}
        t={t}
      />

    </div>
  )
}
