import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Upload, Monitor, Activity, ArrowUpRight } from 'lucide-react'
import Nav from '../components/Nav'
import ImageUpload from '../components/ImageUpload'
import LiveCapture from '../components/LiveCapture'
import EcgRealtime from '../components/EcgRealtime'
import { useLanguage } from '../LanguageContext'
import { usePlatform } from '../hooks/usePlatform'
import { monitorCopy } from '../services/monitorCopy'

export default function Analyzer() {
  const [tab, setTab] = useState('realtime')
  const { t, lang } = useLanguage()
  const { isIOS } = usePlatform()
  const c = monitorCopy(lang)
  return <div className={`studio-page ${isIOS ? 'studio-ios' : ''}`}>
    <Nav page="sub" title="CardioScan" />
    <main className="studio-container">
      <header className="studio-header">
        <div><span className="eyebrow">CARDIOSCAN / {c.workspace}</span><h1>{c.title}</h1><p>{c.subtitle}</p></div>
        <Link to="/history" className="studio-link">{c.history}<ArrowUpRight size={16} /></Link>
      </header>
      <div className="studio-tabs" role="tablist" aria-label={c.workspace}>
        {[[ 'realtime', c.monitor, Activity ], ['upload', t('tabUpload'), Upload], ['live', t('tabLive'), Monitor]].map(([id, label, Icon]) =>
          <button key={id} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} id={`tab-${id}`} onClick={() => setTab(id)}><Icon size={16} />{label}</button>)}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={tab === 'realtime' ? '' : 'secondary-panel'}>
        {tab === 'realtime' ? <EcgRealtime /> : tab === 'upload' ? <ImageUpload /> : <LiveCapture />}
      </div>
      <footer className="studio-footer"><span>CardioScan</span><span>{c.footer}</span></footer>
    </main>
  </div>
}
