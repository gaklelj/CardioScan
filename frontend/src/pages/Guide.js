import { Link } from 'react-router-dom'
import { ArrowUpRight, ArrowRight, Cpu, Wifi, Activity, CheckCircle2 } from 'lucide-react'
import Nav from '../components/Nav'
import { useLanguage } from '../LanguageContext'
import { usePlatform } from '../hooks/usePlatform'
import { monitorCopy } from '../services/monitorCopy'

export default function Guide() {
  const { lang } = useLanguage()
  const { isIOS } = usePlatform()
  const c = monitorCopy(lang)
  return <div className={`studio-page ${isIOS ? 'studio-ios' : ''}`}>
    <Nav page="sub" title="CardioScan" />
    <main className="studio-container guide-container">
      <header className="studio-header"><div><span className="eyebrow">CARDIOSCAN / ADS1293</span><h1>{c.guideTitle}</h1><p>{c.guideSubtitle}</p></div><Link className="studio-link" to="/analyze">{c.monitor}<ArrowUpRight size={16} /></Link></header>
      <section className="guide-section"><div className="section-caption"><span>01</span><h2>{c.quick}</h2></div>
        <div className="guide-steps">{[Cpu, Wifi, Activity, CheckCircle2].map((Icon, i) => <article key={i} className="guide-step">
          <div className="step-top"><Icon size={23} /><span>0{i + 1}</span></div><h3>{c[`step${i + 1}`]}</h3><p>{c[`step${i + 1}body`]}</p>
        </article>)}</div>
      </section>
      <section className="guide-section"><div className="section-caption"><span>02</span><h2>{c.wiring}</h2></div>
        <figure className="electrode-diagram">
          <a href={`${process.env.PUBLIC_URL}/images/ads1293-5lead-protocentral.png`} target="_blank" rel="noopener noreferrer">
            <img src={`${process.env.PUBLIC_URL}/images/ads1293-5lead-protocentral.png`} width="1170" height="970" alt={c.placementAlt} loading="lazy" />
          </a>
          <figcaption>
            <h3>{c.placementTitle}</h3>
            <p>{c.placementNote}</p>
            <p className="electrode-color-note">{c.cableColorNote}</p>
            <a className="connection-link" href="https://protocentral.com/product/protocentral-ads1293-breakout-board/docs/getting-started/" target="_blank" rel="noopener noreferrer">{c.placementSource}<ArrowUpRight size={15} /></a>
          </figcaption>
        </figure>
        <div className="wiring-card"><div className="wiring-intro"><span className="eyebrow">ADS1293 + ESP32</span><h3>{c.wiringSub}</h3><p>{c.electrodeRoles}</p><p>{c.wiringNote}</p><a className="connection-link" href="https://www.ti.com/lit/ds/symlink/ads1293.pdf#page=65" target="_blank" rel="noopener noreferrer">{c.wiringSource}<ArrowUpRight size={15} /></a></div>
          <div className="wiring-inputs" aria-label={c.mapping}>{[['RA', 'IN1'], ['LA', 'IN2'], ['LL', 'IN3'], ['RL', 'IN4 / RLD'], ['V1', 'IN5']].map(([electrode, input]) =>
            <div key={electrode}><strong>{electrode}</strong><span className="wire-line" /><ArrowRight size={15} /><code>{input}</code></div>)}</div>
          <div className="wiring-leads" aria-label={c.leads}>{['I', 'II', 'III', 'V1'].map((lead, i) => <div key={lead}><span className={`lead-token lead-${i}`}>{lead}</span><div><strong>{['LA - RA', 'LL - RA', 'II - I', 'V1 - WCT'][i]}</strong><p>{i === 2 ? c.derived : c.measured}</p></div></div>)}</div>
        </div>
      </section>
      <section className="guide-section"><div className="section-caption"><span>03</span><h2>{c.faq}</h2></div>
        <div className="guide-faq">{[1, 2, 3, 4, 5].map(i => <details key={i}><summary>{c[`q${i}`]}<span>+</span></summary><p>{c[`a${i}`]}</p></details>)}</div>
      </section>
      <div className="guide-cta"><div><span className="eyebrow">I / II / III / V1</span><h2>{c.ready}</h2><p>{c.saved}</p></div><Link to="/analyze" className="record-button">{c.monitor}<ArrowUpRight size={18} /></Link></div>
      <footer className="studio-footer"><span>CardioScan</span><span>{c.footer}</span></footer>
    </main>
  </div>
}
