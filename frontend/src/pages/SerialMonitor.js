import { useState, useEffect, useRef, useCallback } from 'react'
import { Usb, RefreshCw, Circle, Activity, ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Nav from '../components/Nav'
import { useLanguage } from '../LanguageContext'
import { usePlatform } from '../hooks/usePlatform'

const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200]
const BUFFER_SIZE = 400
const POLL_MS = 50

function EcgCanvas({ data }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas

    ctx.clearRect(0, 0, width, height)

    // Grid
    ctx.strokeStyle = 'rgba(44,44,58,0.8)'
    ctx.lineWidth = 0.5
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()
    }
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
    }

    if (data.length < 2) return

    // Normalize
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1

    // Glow
    ctx.shadowColor = 'rgba(231,76,60,0.6)'
    ctx.shadowBlur = 6
    ctx.strokeStyle = '#e74c3c'
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    ctx.beginPath()
    data.forEach((v, i) => {
      const x = (i / (BUFFER_SIZE - 1)) * width
      const y = height - ((v - min) / range) * (height * 0.8) - height * 0.1
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()

    ctx.shadowBlur = 0
  }, [data])

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={200}
      className="w-full rounded-lg"
      style={{ background: 'var(--c-bg)', display: 'block' }}
    />
  )
}

function IOSNavHeader({ title }) {
  const navigate = useNavigate()
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: 'calc(env(safe-area-inset-top) + 8px) 12px 8px',
      background: 'var(--ios-bg)',
      borderBottom: '0.5px solid var(--ios-separator)',
      position: 'relative',
    }}>
      <button onClick={() => navigate('/')} style={{
        display: 'flex', alignItems: 'center', gap: 2,
        background: 'none', border: 'none', color: 'var(--ios-blue)',
        fontSize: 17, cursor: 'pointer', padding: '4px 0',
        WebkitTapHighlightColor: 'transparent',
      }}>
        <ChevronLeft size={22} strokeWidth={2} />
        <span>Back</span>
      </button>
      <span style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
        fontSize: 17, fontWeight: 600, color: 'var(--ios-text-primary)',
      }}>{title}</span>
    </div>
  )
}

export default function SerialMonitor() {
  const { t } = useLanguage()
  const { isIOS } = usePlatform()
  const [ports, setPorts] = useState([])
  const [selectedPort, setSelectedPort] = useState('')
  const [baudRate, setBaudRate] = useState(115200)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [ecgBuffer, setEcgBuffer] = useState([])
  const [sampleCount, setSampleCount] = useState(0)
  const [rawLog, setRawLog] = useState([])

  const pollingRef = useRef(null)
  const lineAccRef = useRef('')

  const refreshPorts = useCallback(async () => {
    if (!invoke) return
    try {
      const list = await invoke('list_serial_ports')
      setPorts(list)
      if (list.length > 0 && !selectedPort) setSelectedPort(list[0])
    } catch (e) {
      console.error(e)
    }
  }, [selectedPort])

  useEffect(() => {
    refreshPorts()
  }, [refreshPorts])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    pollingRef.current = setInterval(async () => {
      if (!invoke) return
      try {
        const raw = await invoke('read_serial_data')
        if (!raw) return

        lineAccRef.current += raw
        const lines = lineAccRef.current.split('\n')
        lineAccRef.current = lines.pop() // keep incomplete line

        lines.forEach(line => {
          const trimmed = line.trim()
          if (!trimmed) return
          const num = parseFloat(trimmed)
          if (!isNaN(num)) {
            setEcgBuffer(prev => {
              const next = [...prev, num]
              return next.length > BUFFER_SIZE ? next.slice(-BUFFER_SIZE) : next
            })
            setSampleCount(n => n + 1)
          }
          setRawLog(prev => {
            const next = [...prev, trimmed]
            return next.length > 100 ? next.slice(-100) : next
          })
        })
      } catch (e) {
        if (e === 'not_connected') {
          stopPolling()
          setConnected(false)
          setError(t('serialDisconnected'))
        }
      }
    }, POLL_MS)
  }, [t, stopPolling])

  const handleConnect = async () => {
    if (!invoke || !selectedPort) return
    setConnecting(true)
    setError('')
    try {
      await invoke('connect_serial', { port: selectedPort, baudRate: baudRate })
      setConnected(true)
      setEcgBuffer([])
      setSampleCount(0)
      setRawLog([])
      lineAccRef.current = ''
      startPolling()
    } catch (e) {
      setError(String(e))
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    stopPolling()
    if (invoke) await invoke('disconnect_serial').catch(() => {})
    setConnected(false)
  }

  useEffect(() => () => stopPolling(), [stopPolling])

  if (!invoke) {
    return (
      <div className={isIOS ? 'ios-page' : 'min-h-screen flex flex-col'} style={isIOS ? {} : { background: 'var(--c-bg)', color: 'var(--c-text)' }}>
        {isIOS ? <IOSNavHeader title={t('serialTitle')} /> : <Nav page="sub" title={t('serialTitle')} />}
        <div className="flex-1 flex items-center justify-center">
          <p style={{ color: isIOS ? 'var(--ios-text-secondary)' : 'var(--c-muted)' }}>{t('serialDesktopOnly')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={isIOS ? 'ios-page' : 'min-h-screen flex flex-col'} style={isIOS ? {} : { background: 'var(--c-bg)', color: 'var(--c-text)' }}>
      {isIOS ? <IOSNavHeader title={t('serialTitle')} /> : <Nav page="sub" title={t('serialTitle')} />}

      <main className="flex-1 px-4 sm:px-6 py-8 max-w-4xl mx-auto w-full flex flex-col gap-6">

        {/* Connection panel */}
        <div className="rounded-2xl border p-5 sm:p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-end"
          style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}>

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <label className="text-xs" style={{ color: 'var(--c-dim)' }}>{t('serialPort')}</label>
            <div className="flex gap-2">
              <select
                value={selectedPort}
                onChange={e => setSelectedPort(e.target.value)}
                disabled={connected}
                className="flex-1 rounded-lg px-3 py-2 text-sm border outline-none"
                style={{
                  background: 'var(--c-bg)',
                  borderColor: 'var(--c-border)',
                  color: 'var(--c-text)',
                }}
              >
                {ports.length === 0
                  ? <option value="">{t('serialNoPorts')}</option>
                  : ports.map(p => <option key={p} value={p}>{p}</option>)
                }
              </select>
              <button
                onClick={refreshPorts}
                disabled={connected}
                className="p-2 rounded-lg border transition-colors cursor-pointer"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
                title={t('serialRefresh')}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--c-dim)' }}>{t('serialBaud')}</label>
            <select
              value={baudRate}
              onChange={e => setBaudRate(Number(e.target.value))}
              disabled={connected}
              className="rounded-lg px-3 py-2 text-sm border outline-none"
              style={{
                background: 'var(--c-bg)',
                borderColor: 'var(--c-border)',
                color: 'var(--c-text)',
              }}
            >
              {BAUD_RATES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <button
            onClick={connected ? handleDisconnect : handleConnect}
            disabled={connecting || (!connected && !selectedPort)}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            style={connected
              ? { background: 'var(--c-warn-bg)', color: 'var(--c-warn-text)', border: '1px solid var(--c-warn-border)' }
              : { background: 'var(--c-accent)', color: 'var(--c-accent-fg)' }
            }
          >
            {connecting ? t('serialConnecting') : connected ? t('serialDisconnect') : t('serialConnect')}
          </button>
        </div>

        {error && (
          <p className="text-sm px-4 py-2 rounded-lg border"
            style={{ color: 'var(--c-warn-text)', background: 'var(--c-warn-bg)', borderColor: 'var(--c-warn-border)' }}>
            {error}
          </p>
        )}

        {/* Status bar */}
        <div className="flex items-center gap-3">
          <Circle
            size={8}
            fill={connected ? '#27ae60' : 'var(--c-dim)'}
            style={{ color: connected ? '#27ae60' : 'var(--c-dim)' }}
          />
          <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
            {connected ? t('serialConnected') : t('serialNotConnected')}
          </span>
          {connected && (
            <span className="text-xs font-mono ml-auto" style={{ color: 'var(--c-dim)' }}>
              {sampleCount} {t('samples')}
            </span>
          )}
        </div>

        {/* ECG waveform */}
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}>
          <div className="flex items-center gap-2 px-5 py-3 border-b"
            style={{ borderColor: 'var(--c-border)' }}>
            <Activity size={14} style={{ color: 'var(--c-dim)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--c-muted)' }}>
              {t('serialWaveform')}
            </span>
            {connected && (
              <span className="ml-auto flex items-center gap-1.5 text-xs"
                style={{ color: '#27ae60' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot inline-block" />
                {t('statusLive')}
              </span>
            )}
          </div>
          <div className="p-4">
            {ecgBuffer.length > 1
              ? <EcgCanvas data={ecgBuffer} />
              : (
                <div className="flex items-center justify-center h-[200px]"
                  style={{ color: 'var(--c-dim)', fontSize: '13px' }}>
                  {connected ? t('serialWaiting') : t('serialConnectFirst')}
                </div>
              )
            }
          </div>
        </div>

        {/* Raw log */}
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}>
          <div className="flex items-center gap-2 px-5 py-3 border-b"
            style={{ borderColor: 'var(--c-border)' }}>
            <Usb size={14} style={{ color: 'var(--c-dim)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--c-muted)' }}>
              {t('serialLog')}
            </span>
            {rawLog.length > 0 && (
              <button
                onClick={() => setRawLog([])}
                className="ml-auto text-xs cursor-pointer transition-colors"
                style={{ color: 'var(--c-dim)' }}
              >
                {t('serialClear')}
              </button>
            )}
          </div>
          <div
            className="p-4 font-mono text-xs overflow-y-auto"
            style={{
              height: '140px',
              color: 'var(--c-muted)',
              background: 'var(--c-bg)',
            }}
          >
            {rawLog.length === 0
              ? <span style={{ color: 'var(--c-dim)' }}>{t('serialLogEmpty')}</span>
              : rawLog.slice(-50).map((line, i) => (
                <div key={i} style={{ lineHeight: '1.7' }}>{line}</div>
              ))
            }
          </div>
        </div>

      </main>
    </div>
  )
}
