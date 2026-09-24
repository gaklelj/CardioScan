import { DEMO_RATE, DEMO_BPM, DEMO_RESULT, simulatedSample } from '../services/ecgSimulation'
import { parseEcgSample } from '../services/ecgProtocol'
import { analysisWindow } from '../services/ecgRecording'
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

  const [connMode,        setConnMode]        = useState('demo')
  const [serverOnline,    setServerOnline]    = useState(false)
  const [deviceConnected, setDeviceConnected] = useState(false)
  const [deviceInfo,      setDeviceInfo]      = useState(null)
  const [scanStatus,      setScanStatus]      = useState('idle')
  const [streamInfo, setStreamInfo] = useState(null)
  const [streamError, setStreamError] = useState('')
  const timingRef = useRef([])
  const streamInfoRef = useRef(null)
  const [duration,        setDuration]        = useState(0)
  const [sampleCount,     setSampleCount]     = useState(0)
  const [heartRate,       setHeartRate]       = useState(null)
  const [aiStatus,        setAiStatus]        = useState('idle')
  const [aiResult,        setAiResult]        = useState(null)
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
  }, [aiResult]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const simulationTimerRef = useRef(null)
  const timerRef      = useRef(null)
  const connModeRef   = useRef('demo')
  const stopScanRef = useRef(null)
  const startedAtRef = useRef(null)

  /* ─── Canvas ────────────────────────────────────────────────────── */
  useEffect(() => {
    const transports = ['polling']
    const socket = io(BACKEND, { path: SOCKET_PATH, transports })
    socketRef.current = socket

    socket.on('connect', () => {
      setServerOnline(true)
      socket.emit('check_ecg_device', { mode: connModeRef.current })
    })
    socket.on('disconnect', () => {
      setServerOnline(false); setDeviceConnected(false)
      if (connModeRef.current !== 'demo') stopScanRef.current?.()
    })
    socket.on('device_status', (data) => {
      if (!data.connected && connModeRef.current !== 'demo') stopScanRef.current?.()
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
      if (data.timestamp_us !== undefined) timingRef.current.push([data.timestamp_us, data.sequence, data.lost_samples])
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
      clearInterval(simulationTimerRef.current)
      socket.emit('stop_ecg')
      socket.disconnect()
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  /* ─── Анализ через REST ─────────────────────────────────────────── */
  const analyzePoints = useCallback(async (channels) => {
    const window = analysisWindow(channels, timingRef.current, streamInfoRef.current?.sample_rate_hz)
    const points = window.channels[0] ?? []
    if (!points.length) return
    setAiStatus('analyzing')
    try {
      const res  = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points, channels: window.channels,
          sample_rate_hz: streamInfoRef.current?.sample_rate_hz,
          timing: window.timing,
          missing_samples: streamInfoRef.current?.missing_samples ?? 0 }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAiResult(data); setAiStatus('done')
    } catch (error) { setAiStatus('error'); setStreamError(error.message) }
  }, [])

  /* ─── Старт / стоп ──────────────────────────────────────────────── */
  const startScan = () => {
    if (scanStatusRef.current === 'scanning') return
    startedAtRef.current = Date.now()
    recordingRef.current = [[], [], [], []]
    timingRef.current = []
    streamInfoRef.current = null
    setStreamInfo(null)
    setStreamError('')
    historyId.current = null
    setSampleCount(0); setDuration(0); setHeartRate(null)
    setAiResult(null); setAiStatus('idle')
    setSymptoms(null); setShowSymptoms(false)
    setRiskData(null); setRiskLoading(false)
    setScanStatus('scanning'); scanStatusRef.current = 'scanning'
    if (connModeRef.current === 'demo') {
      setHeartRate(DEMO_BPM)
      setAiResult(DEMO_RESULT); setAiStatus('done')
      const appendSamples = () => {
        const target = Math.floor((Date.now() - startedAtRef.current) * DEMO_RATE / 1000) + 1
        for (let i = recordingRef.current[0].length; i < target; i++) {
          simulatedSample(i).forEach((value, lead) => recordingRef.current[lead].push(value))
          timingRef.current.push([i * 1e6 / DEMO_RATE, i, 0])
        }
        const info = { sample_rate_hz: DEMO_RATE, missing_samples: 0, frames: [{ lost_samples: 0 }] }
        streamInfoRef.current = info
        setStreamInfo(info)
        setSampleCount(recordingRef.current[0].length)
      }
      appendSamples()
      simulationTimerRef.current = setInterval(appendSamples, 40)
    } else {
      socketRef.current?.emit('start_ecg', { mode: connModeRef.current })
    }
    timerRef.current = setInterval(() => setDuration(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000)
  }

  const stopScan = async () => {
    if (scanStatusRef.current !== 'scanning') return
    const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000)
    setDuration(elapsed)
    clearInterval(timerRef.current)
    clearInterval(simulationTimerRef.current)
    const simulated = connModeRef.current === 'demo'
    if (!simulated) socketRef.current?.emit('stop_ecg')
    setScanStatus('done'); scanStatusRef.current = 'done'

    const channels = recordingRef.current.filter(channel => channel.length).map(channel => [...channel])
    if (!channels.length) { setAiStatus('idle'); return }
    setAiStatus(simulated ? 'done' : 'analyzing')
    setShowSymptoms(!simulated)

    // Save record to history immediately with points; model result will be updated via socket/analyzePoints
    historyId.current = null
    try {
      const rec = await addToHistory({
        type:        'live',
        modelResult: simulated ? DEMO_RESULT : null,
        aiSummary: simulated ? 'Симуляция ЭКГ: нормальный синусовый ритм, 72 уд/мин.' : null,
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
    }
    if (!simulated) analyzePoints(channels)
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
    if (scanStatus === 'scanning') return
    setConnMode(mode)
    connModeRef.current = mode
    setDeviceConnected(false)
    setDeviceInfo(null)
    if (mode !== 'demo') socketRef.current?.emit('check_ecg_device', { mode })
  }

  const canStart = (connMode === 'demo' || serverOnline) && scanStatus !== 'scanning' && aiStatus !== 'analyzing'
  return (
    <div className="space-y-3">

      {connMode === 'demo' && <p className="record-note" role="status">Симуляция ЭКГ · нормальный синусовый ритм · 72 уд/мин</p>}
      <MonitorPanel mode={connMode} changeMode={handleModeChange} serverOnline={serverOnline}
        deviceConnected={deviceConnected} deviceInfo={deviceInfo} status={scanStatus}
        duration={duration} sampleCount={sampleCount} streamInfo={streamInfo} canStart={canStart}
        start={startScan} stop={stopScan} error={streamError}>
        <EcgScope recordingRef={recordingRef} timingRef={timingRef} status={scanStatus} mode={connMode} sampleCount={sampleCount} />
      </MonitorPanel>
      {offlineCount > 0 && (
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

      {symptoms?.readable?.length > 0 && (
        <SymptomsCard symptoms={symptoms.readable} t={t} />
      )}

      {/* Оценка кардиологического риска */}
      <RiskAssessmentCard riskData={riskData} loading={riskLoading} t={t} />
      <PatientDataStatus questionnaire={symptoms} t={t} />

      {/* Результат AI */}
      {(aiStatus === 'analyzing' || aiStatus === 'done' || aiStatus === 'error') && (
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
            {aiStatus === 'analyzing' && (
              <div className="flex justify-center py-8">
                <svg className="animate-spin w-6 h-6" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--c-dim)' }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              </div>
            )}
            {aiStatus === 'done' && aiResult && (
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
                    {aiResult.simulated ? '72 уд/мин' : `${(aiResult.confidence * 100).toFixed(1)}%`}
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
              <p className="text-sm text-center py-4" style={{ color: 'var(--c-warn-text)' }}>{t('errorInference')}</p>
            )}
          </div>
        </div>
      )}

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
