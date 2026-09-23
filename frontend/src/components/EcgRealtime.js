import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { Play, Square, Activity, Cpu } from 'lucide-react'
import { useLanguage } from '../LanguageContext'

const ANALYZE_URL = 'https://foodtrack.beast-inside.kz/cardio/api/ecg/analyze'
const MAX_POINTS  = 500
const CANVAS_W    = 800
const CANVAS_H    = 200

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

  const [serverOnline,    setServerOnline]    = useState(false)
  const [deviceConnected, setDeviceConnected] = useState(false)
  const [deviceInfo,      setDeviceInfo]      = useState(null)
  const [scanStatus,      setScanStatus]      = useState('idle')   // idle | scanning | done
  const [duration,        setDuration]        = useState(0)
  const [sampleCount,     setSampleCount]     = useState(0)
  const [heartRate,       setHeartRate]       = useState(null)
  const [aiStatus,        setAiStatus]        = useState('idle')   // idle | analyzing | done | error
  const [aiResult,        setAiResult]        = useState(null)

  const canvasRef      = useRef(null)
  const socketRef      = useRef(null)
  const dataBufferRef  = useRef([])
  const animFrameRef   = useRef(null)
  const scanStatusRef  = useRef('idle')
  const timerRef       = useRef(null)

  /* ─── Canvas draw loop ─────────────────────────────────────────── */
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = CANVAS_W
    const H = CANVAS_H
    const buf = dataBufferRef.current

    // Background
    ctx.fillStyle = '#0c0c0c'
    ctx.fillRect(0, 0, W, H)

    // ECG-paper grid (faint red)
    ctx.strokeStyle = 'rgba(220,60,60,0.08)'
    ctx.lineWidth = 1
    const cols = 20, rows = 8
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath(); ctx.moveTo((W / cols) * i, 0); ctx.lineTo((W / cols) * i, H); ctx.stroke()
    }
    for (let i = 0; i <= rows; i++) {
      ctx.beginPath(); ctx.moveTo(0, (H / rows) * i); ctx.lineTo(W, (H / rows) * i); ctx.stroke()
    }

    // Baseline
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 6])
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke()
    ctx.setLineDash([])

    if (buf.length >= 2) {
      const isScanning = scanStatusRef.current === 'scanning'
      const visible = buf.slice(-MAX_POINTS)
      const min = Math.min(...visible)
      const max = Math.max(...visible)
      const range = (max - min) || 1
      const pad = H * 0.12
      const xStep = W / (MAX_POINTS - 1)

      ctx.strokeStyle = isScanning ? '#22c55e' : '#3a3a3a'
      ctx.lineWidth = 1.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.shadowColor = isScanning ? 'rgba(34,197,94,0.35)' : 'transparent'
      ctx.shadowBlur = isScanning ? 8 : 0
      ctx.beginPath()
      for (let i = 0; i < visible.length; i++) {
        const x = i * xStep
        const y = H - pad - ((visible[i] - min) / range) * (H - 2 * pad)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    animFrameRef.current = requestAnimationFrame(drawChart)
  }, [])

  /* ─── Send points → backend Keras model ────────────────────────── */
  const analyzePoints = useCallback(async (points) => {
    if (!points.length) return
    setAiStatus('analyzing')
    try {
      const res = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAiResult(data)
      setAiStatus('done')
    } catch {
      setAiStatus('error')
    }
  }, [])

  /* ─── Socket.io + animation loop init ──────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) { canvas.width = CANVAS_W; canvas.height = CANVAS_H }
    animFrameRef.current = requestAnimationFrame(drawChart)

    const socket = io('https://foodtrack.beast-inside.kz', { path: '/cardio/socket.io', transports: ['polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setServerOnline(true)
      socket.emit('check_ecg_device')
    })
    socket.on('disconnect', () => { setServerOnline(false); setDeviceConnected(false) })
    socket.on('device_status', (data) => {
      setDeviceConnected(data.connected)
      if (data.connected) setDeviceInfo(data)
    })
    socket.on('ecg_point', (data) => {
      dataBufferRef.current.push(data.value)
      setSampleCount(n => n + 1)
      if (data.heart_rate) setHeartRate(data.heart_rate)
    })
    socket.on('ecg_analysis', (data) => {
      // Keras model auto-fires every 1000 points
      setAiResult(data)
      setAiStatus('done')
    })
    socket.on('ecg_scan_done', () => {
      clearInterval(timerRef.current)
      setScanStatus('done'); scanStatusRef.current = 'done'
      analyzePoints(dataBufferRef.current)
    })

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      clearInterval(timerRef.current)
      socket.emit('stop_ecg')
      socket.disconnect()
    }
  }, [drawChart, analyzePoints])

  /* ─── Controls ──────────────────────────────────────────────────── */
  const startScan = () => {
    dataBufferRef.current = []
    setSampleCount(0); setDuration(0); setHeartRate(null)
    setAiResult(null); setAiStatus('idle')
    setScanStatus('scanning'); scanStatusRef.current = 'scanning'
    socketRef.current?.emit('start_ecg')
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
  }

  const stopScan = () => {
    clearInterval(timerRef.current)
    socketRef.current?.emit('stop_ecg')
    setScanStatus('done'); scanStatusRef.current = 'done'
    analyzePoints(dataBufferRef.current)
  }

  const canStart = serverOnline && deviceConnected && scanStatus !== 'scanning'
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="space-y-3">

      {/* Connection status */}
      <div
        className="border rounded-2xl p-4 space-y-3"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}
      >
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--c-dim)' }}>
          {t('deviceStatus')}
        </p>
        <div className="flex items-center gap-5 flex-wrap">
          {/* Server */}
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${serverOnline ? 'bg-emerald-500 pulse-dot' : 'bg-red-500'}`}
            />
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
              Flask Server
            </span>
            {!serverOnline && (
              <span className="text-xs" style={{ color: 'var(--c-dim)' }}>— {t('serverOffline')}</span>
            )}
          </div>

          {/* Device */}
          <div className="flex items-center gap-2">
            <Cpu size={11} style={{ color: deviceConnected ? '#22c55e' : 'var(--c-dim)' }} />
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
              {deviceConnected ? t('deviceConnected') : t('deviceNotConnected')}
            </span>
            {deviceInfo?.port && (
              <span className="text-xs font-mono" style={{ color: 'var(--c-dim)' }}>
                {deviceInfo.port}
              </span>
            )}
            {deviceInfo?.baud_rate && (
              <span className="text-xs font-mono" style={{ color: 'var(--c-dim)' }}>
                {deviceInfo.baud_rate} baud
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Scan controls */}
      <div className="flex gap-2">
        <button
          onClick={startScan}
          disabled={!canStart}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--c-accent)', color: 'var(--c-accent-fg)' }}
        >
          {scanStatus === 'scanning' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
              {t('scanScanning')}
            </>
          ) : (
            <><Play size={13} /> {t('startScan')}</>
          )}
        </button>
        <button
          onClick={stopScan}
          disabled={scanStatus !== 'scanning'}
          className="flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
        >
          <Square size={12} /> {t('stopScan')}
        </button>
      </div>

      {/* Waveform display */}
      <div
        className="border rounded-2xl overflow-hidden"
        style={{ borderColor: 'var(--c-border)' }}
      >
        {/* Status bar */}
        <div
          className="flex items-center justify-between px-4 py-2.5 border-b flex-wrap gap-2"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${scanStatus === 'scanning' ? 'bg-emerald-500 pulse-dot' : ''}`}
              style={scanStatus !== 'scanning' ? { background: 'var(--c-border)' } : {}}
            />
            <span className="text-xs" style={{ color: 'var(--c-dim)' }}>
              {scanStatus === 'scanning'
                ? t('scanScanning')
                : scanStatus === 'done'
                  ? t('scanDone')
                  : t('scanIdle')}
            </span>
          </div>
          {scanStatus !== 'idle' && (
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono" style={{ color: 'var(--c-dim)' }}>{fmt(duration)}</span>
              <span className="text-xs font-mono" style={{ color: 'var(--c-dim)' }}>
                {sampleCount} {t('samples')}
              </span>
              {heartRate && (
                <span className="text-xs font-mono" style={{ color: '#f87171' }}>
                  ♥ {heartRate} bpm
                </span>
              )}
            </div>
          )}
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />

        {/* Idle hint */}
        {scanStatus === 'idle' && (
          <div
            className="flex items-center justify-center gap-2 py-3 border-t"
            style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}
          >
            <Activity size={11} style={{ color: 'var(--c-dim)' }} />
            <p className="text-xs" style={{ color: 'var(--c-dim)' }}>{t('realtimeInfo')}</p>
          </div>
        )}
      </div>

      {/* AI result */}
      {(aiStatus === 'analyzing' || aiStatus === 'done' || aiStatus === 'error') && (
        <div
          className="border rounded-2xl overflow-hidden animate-fade-in"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--c-border)' }}
          >
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--c-dim)' }}>
              {t('result')}
            </p>
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
                {/* Main diagnosis */}
                <div
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{
                    background: `${CLASS_COLORS[aiResult.class] ?? '#6b7280'}18`,
                    border: `1px solid ${CLASS_COLORS[aiResult.class] ?? '#6b7280'}44`,
                  }}
                >
                  <span className="font-semibold text-sm" style={{ color: CLASS_COLORS[aiResult.class] ?? 'var(--c-text)' }}>
                    {aiResult.class}
                  </span>
                  <span className="text-sm font-mono font-medium" style={{ color: CLASS_COLORS[aiResult.class] ?? 'var(--c-text)' }}>
                    {(aiResult.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                {/* All classes */}
                {aiResult.all && (
                  <div className="space-y-1.5">
                    {Object.entries(aiResult.all)
                      .sort(([, a], [, b]) => b - a)
                      .map(([cls, conf]) => (
                        <div key={cls} className="flex items-center gap-2">
                          <span className="text-xs w-36 shrink-0 truncate" style={{ color: 'var(--c-dim)' }}>{cls}</span>
                          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${(conf * 100).toFixed(1)}%`, background: CLASS_COLORS[cls] ?? '#6b7280' }}
                            />
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
              <p className="text-sm text-center py-4" style={{ color: 'var(--c-warn-text)' }}>
                {t('errorInference')}
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
