import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { Play, Square, Activity, Cpu, Usb, Bluetooth, Wifi, CloudOff, Upload } from 'lucide-react'
import { useLanguage } from '../LanguageContext'

const isMobileDevice = /Android|iPhone|iPad/i.test(navigator.userAgent)
// Десктоп → локальный бэкенд (он и читает USB/WiFi сам)
// Мобайл  → VPS
const BACKEND     = isMobileDevice
  ? 'https://foodtrack.beast-inside.kz'
  : 'http://localhost:6767'
const SOCKET_PATH = isMobileDevice ? '/cardio/socket.io' : '/socket.io'
const ANALYZE_URL = isMobileDevice
  ? 'https://foodtrack.beast-inside.kz/cardio/api/ecg/analyze'
  : 'http://localhost:6767/api/ecg/analyze'
const OFFLINE_KEY = 'ecg_offline_buffer'
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

const CONN_MODES = [
  { id: 'usb',  label: 'USB',       Icon: Usb       },
  { id: 'bt',   label: 'Bluetooth', Icon: Bluetooth },
  { id: 'wifi', label: 'WiFi',      Icon: Wifi      },
]

export default function EcgRealtime() {
  const { t } = useLanguage()

  const [connMode,        setConnMode]        = useState('usb')
  const [serverOnline,    setServerOnline]    = useState(false)
  const [deviceConnected, setDeviceConnected] = useState(false)
  const [deviceInfo,      setDeviceInfo]      = useState(null)
  const [scanStatus,      setScanStatus]      = useState('idle')
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

  const canvasRef     = useRef(null)
  const socketRef     = useRef(null)
  const dataBufferRef = useRef([])
  const animFrameRef  = useRef(null)
  const scanStatusRef = useRef('idle')
  const timerRef      = useRef(null)
  const connModeRef   = useRef('usb')

  /* ─── Canvas ────────────────────────────────────────────────────── */
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = CANVAS_W, H = CANVAS_H
    const buf = dataBufferRef.current

    ctx.fillStyle = '#0c0c0c'
    ctx.fillRect(0, 0, W, H)

    ctx.strokeStyle = 'rgba(220,60,60,0.08)'
    ctx.lineWidth = 1
    const cols = 20, rows = 8
    for (let i = 0; i <= cols; i++) {
      ctx.beginPath(); ctx.moveTo((W / cols) * i, 0); ctx.lineTo((W / cols) * i, H); ctx.stroke()
    }
    for (let i = 0; i <= rows; i++) {
      ctx.beginPath(); ctx.moveTo(0, (H / rows) * i); ctx.lineTo(W, (H / rows) * i); ctx.stroke()
    }

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

  /* ─── Socket.io + animation loop ───────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) { canvas.width = CANVAS_W; canvas.height = CANVAS_H }
    animFrameRef.current = requestAnimationFrame(drawChart)

    const transports = isMobileDevice ? ['polling'] : ['websocket']
    const socket = io(BACKEND, { path: SOCKET_PATH, transports })
    socketRef.current = socket

    socket.on('connect', () => {
      setServerOnline(true)
      socket.emit('check_ecg_device', { mode: connModeRef.current })
    })
    socket.on('disconnect', () => { setServerOnline(false); setDeviceConnected(false) })
    socket.on('device_status', (data) => {
      setDeviceConnected(data.connected)
      setDeviceInfo(data.connected ? data : null)
    })
    socket.on('ecg_point', (data) => {
      dataBufferRef.current.push(data.value)
      setSampleCount(n => n + 1)
      if (data.heart_rate) setHeartRate(data.heart_rate)
    })
    socket.on('ecg_analysis', (data) => { setAiResult(data); setAiStatus('done') })

    const onOnline  = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      clearInterval(timerRef.current)
      socket.emit('stop_ecg')
      socket.disconnect()
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [drawChart])

  /* ─── Анализ через REST ─────────────────────────────────────────── */
  const analyzePoints = useCallback(async (points) => {
    if (!points.length) return
    setAiStatus('analyzing')
    try {
      const res  = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAiResult(data); setAiStatus('done')
    } catch { setAiStatus('error') }
  }, [])

  /* ─── Старт / стоп ──────────────────────────────────────────────── */
  const startScan = () => {
    dataBufferRef.current = []
    setSampleCount(0); setDuration(0); setHeartRate(null)
    setAiResult(null); setAiStatus('idle')
    setScanStatus('scanning'); scanStatusRef.current = 'scanning'
    socketRef.current?.emit('start_ecg', { mode: connModeRef.current })
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
  }

  const stopScan = () => {
    clearInterval(timerRef.current)
    socketRef.current?.emit('stop_ecg')
    setScanStatus('done'); scanStatusRef.current = 'done'
    analyzePoints(dataBufferRef.current)
  }

  /* ─── Отправить офлайн-буфер ────────────────────────────────────── */
  const flushOffline = async () => {
    try {
      const stored = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]')
      if (!stored.length) return
      setFlushStatus('flushing')
      const res  = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: stored }),
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
    socketRef.current?.emit('check_ecg_device', { mode })
  }

  const canStart = scanStatus !== 'scanning'
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="space-y-3">

      {/* Режим подключения */}
      <div className="border rounded-2xl p-3" style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
        <div className="flex gap-2">
          {CONN_MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => handleModeChange(id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer"
              style={{
                background: connMode === id ? 'var(--c-accent)' : 'transparent',
                color:      connMode === id ? 'var(--c-accent-fg)' : 'var(--c-dim)',
                border:     connMode === id ? 'none' : '1px solid var(--c-border)',
              }}
            >
              <Icon size={11} />{label}
            </button>
          ))}
        </div>
        {connMode === 'wifi' && (
          <p className="text-xs mt-2" style={{ color: 'var(--c-dim)' }}>
            Подключись к Wi-Fi сети ESP32 (192.168.4.1).
            {' '}<span style={{ color: '#f59e0b' }}>Интернет будет недоступен</span> — данные сохранятся офлайн.
          </p>
        )}
        {connMode === 'bt' && (
          <p className="text-xs mt-2" style={{ color: 'var(--c-dim)' }}>
            Убедись что ESP32 сопряжён в Системных настройках → Bluetooth, затем выбери COM-порт.
          </p>
        )}
      </div>

      {/* Офлайн-буфер */}
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

      {/* Статус подключения */}
      <div className="border rounded-2xl p-4 space-y-3" style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--c-dim)' }}>{t('deviceStatus')}</p>
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${serverOnline ? 'bg-emerald-500 pulse-dot' : 'bg-red-500'}`} />
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>Flask Server</span>
            {!serverOnline && <span className="text-xs" style={{ color: 'var(--c-dim)' }}>— {t('serverOffline')}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Cpu size={11} style={{ color: deviceConnected ? '#22c55e' : 'var(--c-dim)' }} />
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
              {deviceConnected ? t('deviceConnected') : t('deviceNotConnected')}
            </span>
            {deviceInfo?.port && (
              <span className="text-xs font-mono" style={{ color: 'var(--c-dim)' }}>{deviceInfo.port}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
              {isOnline ? 'Онлайн' : 'Офлайн'}
            </span>
          </div>
        </div>
      </div>

      {/* Кнопки */}
      <div className="flex gap-2">
        <button
          onClick={startScan}
          disabled={!canStart}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--c-accent)', color: 'var(--c-accent-fg)' }}
        >
          {scanStatus === 'scanning' ? (
            <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />{t('scanScanning')}</>
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

      {/* Осциллограф */}
      <div className="border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--c-border)' }}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b flex-wrap gap-2"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${scanStatus === 'scanning' ? 'bg-emerald-500 pulse-dot' : ''}`}
              style={scanStatus !== 'scanning' ? { background: 'var(--c-border)' } : {}}
            />
            <span className="text-xs" style={{ color: 'var(--c-dim)' }}>
              {scanStatus === 'scanning' ? t('scanScanning') : scanStatus === 'done' ? t('scanDone') : t('scanIdle')}
            </span>
          </div>
          {scanStatus !== 'idle' && (
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono" style={{ color: 'var(--c-dim)' }}>{fmt(duration)}</span>
              <span className="text-xs font-mono" style={{ color: 'var(--c-dim)' }}>{sampleCount} {t('samples')}</span>
              {heartRate && <span className="text-xs font-mono" style={{ color: '#f87171' }}>♥ {heartRate} bpm</span>}
            </div>
          )}
        </div>
        <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
        {scanStatus === 'idle' && (
          <div className="flex items-center justify-center gap-2 py-3 border-t"
            style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
            <Activity size={11} style={{ color: 'var(--c-dim)' }} />
            <p className="text-xs" style={{ color: 'var(--c-dim)' }}>{t('realtimeInfo')}</p>
          </div>
        )}
      </div>

      {/* Результат AI */}
      {(aiStatus === 'analyzing' || aiStatus === 'done' || aiStatus === 'error') && (
        <div className="border rounded-2xl overflow-hidden animate-fade-in"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--c-dim)' }}>{t('result')}</p>
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
                <div className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{
                    background: `${CLASS_COLORS[aiResult.class] ?? '#6b7280'}18`,
                    border: `1px solid ${CLASS_COLORS[aiResult.class] ?? '#6b7280'}44`,
                  }}>
                  <span className="font-semibold text-sm" style={{ color: CLASS_COLORS[aiResult.class] ?? 'var(--c-text)' }}>
                    {aiResult.class}
                  </span>
                  <span className="text-sm font-mono font-medium" style={{ color: CLASS_COLORS[aiResult.class] ?? 'var(--c-text)' }}>
                    {(aiResult.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                {aiResult.all && (
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

    </div>
  )
}
