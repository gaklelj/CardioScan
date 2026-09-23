import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { Play, Square, Info } from 'lucide-react'
import { useLanguage } from '../LanguageContext'


export default function LiveCapture() {
  const { t } = useLanguage()
  const [status, setStatus]         = useState('idle')
  const [frame, setFrame]           = useState(null)
  const [frameCount, setFrameCount] = useState(0)
  const socketRef = useRef(null)

  useEffect(() => {
    socketRef.current = io('https://foodtrack.beast-inside.kz', { path: '/cardio/socket.io', transports: ['polling', 'websocket'] })
    socketRef.current.on('frame', (data) => {
      setFrame('data:image/jpeg;base64,' + data.image)
      setFrameCount((n) => n + 1)
    })
    return () => {
      socketRef.current.emit('stop_capture')
      socketRef.current.disconnect()
    }
  }, [])

  const start = () => { setStatus('running'); setFrameCount(0); socketRef.current.emit('start_capture') }
  const stop  = () => { setStatus('stopped'); socketRef.current.emit('stop_capture') }

  const statusLabel = status === 'running' ? t('statusLive') : status === 'stopped' ? t('statusStopped') : t('statusIdle')

  return (
    <div className="space-y-3">

      {/* Info */}
      <div className="border rounded-2xl p-4 flex gap-3" style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
        <Info size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--c-dim)' }} />
        <div className="space-y-1">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--c-muted)' }}>
            {t('liveInfo')}
          </p>
          <p className="text-xs" style={{ color: 'var(--c-dim)' }}>{t('liveFps')}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={start} disabled={status === 'running'}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--c-accent)', color: 'var(--c-accent-fg)' }}
        >
          {status === 'running' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
              {t('capturing')}
            </>
          ) : (
            <><Play size={12} /> {t('startCapture')}</>
          )}
        </button>
        <button
          onClick={stop} disabled={status !== 'running'}
          className="flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
        >
          <Square size={12} /> {t('stop')}
        </button>
      </div>

      {/* Stream */}
      <div className="border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--c-border)' }}>
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${status === 'running' ? 'bg-emerald-500 pulse-dot' : ''}`}
              style={status !== 'running' ? { background: 'var(--c-border)' } : {}}
            />
            <span className="text-xs" style={{ color: 'var(--c-dim)' }}>{statusLabel}</span>
          </div>
          {frameCount > 0 && (
            <span className="text-xs font-mono" style={{ color: 'var(--c-dim)' }}>{frameCount} {t('frames')}</span>
          )}
        </div>

        {frame ? (
          <img src={frame} alt="Live ECG stream" className="w-full block" />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <svg width="32" height="20" viewBox="0 0 32 20" fill="none" style={{ opacity: 0.25 }}>
              <polyline
                points="0,10 6,10 10,10 12,2 14,18 16,1 18,17 20,10 26,10 32,10"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: 'var(--c-muted)' }}
              />
            </svg>
            <p className="text-xs" style={{ color: 'var(--c-dim)' }}>
              {status === 'idle' ? t('pressStart') : t('streamEnded')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
