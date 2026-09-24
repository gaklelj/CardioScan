import { Link } from 'react-router-dom'
import { Wifi, Usb, ArrowUpRight, Play, Square, Activity, Clock3, Radio, Layers3 } from 'lucide-react'
import { useLanguage } from '../LanguageContext'
import { monitorCopy } from '../services/monitorCopy'

export default function MonitorPanel({ children, mode, changeMode, serverOnline, deviceConnected, deviceInfo, status,
  duration, sampleCount, streamInfo, canStart, start, stop, error }) {
  const { lang } = useLanguage()
  const c = monitorCopy(lang)
  const running = status === 'scanning'
  const metrics = [
    { label: c.duration, value: `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`, Icon: Clock3 },
    { label: c.frames, value: sampleCount.toLocaleString(), Icon: Layers3 },
    { label: c.rate, value: streamInfo?.sample_rate_hz ? `${streamInfo.sample_rate_hz} Hz` : '—', Icon: Activity },
    { label: c.losses, value: streamInfo?.missing_samples ?? '—', Icon: Radio },
  ]
  return <div className="monitor-workspace">
    <div className="monitor-metrics">{metrics.map(({ label, value, Icon }) => <div className="metric-card" key={label}>
      <span className="metric-label"><Icon size={14} />{label}</span><strong>{value}</strong>
    </div>)}</div>
    <div className="monitor-layout">
      <div className="monitor-main">{children}</div>
      <aside className="connection-card">
        <div className="connection-title"><span className="device-icon"><Wifi size={21} /></span><div><h2>ADS1293 <span>/ ESP32</span></h2><p>{c.connection}</p></div></div>
        <div className="connection-modes" aria-label={c.connection}>
          {[['wifi', Wifi, 'WiFi'], ['usb', Usb, 'USB']].map(([id, Icon, label]) =>
            <button key={id} aria-pressed={mode === id} disabled={running} onClick={() => changeMode(id)}><Icon size={14} />{label}</button>)}
        </div>
        <div className="connection-status"><span>{c.server}</span><span className={serverOnline ? 'text-connected' : 'text-disconnected'}><i />{serverOnline ? c.online : c.offline}</span></div>
        <div className="connection-status"><span>{c.device}</span><span className={deviceConnected ? 'text-connected' : 'text-disconnected'}><i />{deviceConnected ? c.connected : c.disconnected}</span></div>
        {mode === 'wifi' ? <div className="network-details"><span>{c.network}</span><strong>CardioScan-ESP32</strong><p>{c.password}: <code>12345678</code></p><p>{c.connectHelp}</p></div>
          : <p className="connection-help">{c.legacy}</p>}
        {deviceInfo?.port && <code className="device-address">{deviceInfo.port}</code>}
        {error && <p role="alert" className="connection-error">{error}</p>}
        <button className="record-button" onClick={running ? stop : start} disabled={!running && !canStart}>
          {running ? <Square size={16} /> : <Play size={16} />}{running ? c.stop : c.start}
        </button>
        <p className="record-note">{c.saved}</p>
        <div className="lead-legend">
          {['I', 'II', 'III', 'V1'].map((lead, i) => <div key={lead}><span className={`lead-token lead-${i}`}>{mode === 'wifi' ? lead : `CH${i + 1}`}</span><span>{i === 2 && mode === 'wifi' ? c.derived : c.measured}</span><code>{mode === 'wifi' ? ['LA − RA', 'LL − RA', 'II − I', 'V1 − WCT'][i] : ''}</code></div>)}
        </div>
        <p className="record-note">{c.queue}: {streamInfo?.frames.at(-1)?.lost_samples ?? '—'}</p>
        <Link className="connection-link" to="/guide">{c.guide}<ArrowUpRight size={15} /></Link>
      </aside>
    </div>
    <p className="monitor-footnote">{c.ai}</p>
  </div>
}
