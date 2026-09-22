import { useNavigate } from 'react-router-dom'
import { ScanLine, ChevronRight, Heart, Activity } from 'lucide-react'
import heartImg from '../assets/Gemini_Generated_Image_f0mgkpf0mgkpf0mg-removebg-preview.png'
import { useLanguage } from '../LanguageContext'
import { useTheme } from '../ThemeContext'
import { Sun, Moon } from 'lucide-react'

const VITALS = [
  { label: 'Heart Rate', value: '72', unit: 'BPM',  color: '#FF375F' },
  { label: 'SpO₂',       value: '98', unit: '%',    color: '#30D158' },
  { label: 'QRS',        value: '82', unit: 'ms',   color: 'var(--ios-blue)' },
]

function EcgLine() {
  return (
    <svg viewBox="0 0 300 44" fill="none" style={{ width: '100%' }}>
      <path
        d="M0,22 L28,22 L38,22 L42,6 L46,38 L50,2 L54,38 L58,22 L78,22
           L108,22 L118,22 L122,6 L126,38 L130,2 L134,38 L138,22 L158,22
           L188,22 L198,22 L202,6 L206,38 L210,2 L214,38 L218,22 L238,22 L300,22"
        stroke="#FF375F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  )
}

export default function IOSHome() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { theme, toggle } = useTheme()

  return (
    <div className="ios-page">
      {/* ── Large Title Header ── */}
      <div className="ios-large-title-header">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <h1 className="ios-large-title">CardioScan</h1>
          <button onClick={toggle} className="ios-icon-btn" style={{ marginBottom: 4 }}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        <p className="ios-subtitle">{t('heroSubtitle').split('\n')[0]}</p>
      </div>

      <div className="ios-scroll-content">

        {/* ── Heart Card ── */}
        <div className="ios-card ios-heart-card">
          <div style={{ position: 'relative', height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* glow */}
            <div style={{
              position: 'absolute', width: 160, height: 160,
              background: 'radial-gradient(circle, rgba(255,55,95,0.22) 0%, transparent 70%)',
              filter: 'blur(20px)',
            }} />
            {/* rings */}
            {[120, 148, 176].map((size, i) => (
              <div key={i} className={`ring-${i + 1}`} style={{
                position: 'absolute', width: size, height: size, borderRadius: '50%',
                border: '1px solid rgba(255,55,95,0.3)',
              }} />
            ))}
            <img
              src={heartImg} alt="heart"
              className="heart-float heart-beat"
              style={{ width: 140, height: 140, objectFit: 'contain', position: 'relative', zIndex: 1,
                filter: 'drop-shadow(0 0 18px rgba(255,55,95,0.55))' }}
            />
            {/* BPM badge */}
            <div style={{
              position: 'absolute', bottom: 12, right: 16,
              background: 'rgba(255,55,95,0.15)', borderRadius: 10,
              padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>HR</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#FF375F', fontVariantNumeric: 'tabular-nums' }}>72 BPM</span>
            </div>
          </div>
          <div style={{ paddingBottom: 4 }}>
            <EcgLine />
          </div>
        </div>

        {/* ── Vitals Row ── */}
        <div className="ios-section-label">VITALS</div>
        <div style={{ display: 'flex', gap: 10 }}>
          {VITALS.map(({ label, value, unit, color }) => (
            <div key={label} className="ios-card ios-vital-card">
              <div style={{ fontSize: 10, color: 'var(--ios-text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</span>
                <span style={{ fontSize: 11, color: 'var(--ios-text-secondary)' }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Quick Actions ── */}
        <div className="ios-section-label">ACTIONS</div>
        <div className="ios-list-group">
          <button onClick={() => navigate('/analyze')} className="ios-list-row">
            <div className="ios-list-icon" style={{ background: '#FF375F' }}>
              <ScanLine size={17} color="#fff" />
            </div>
            <div className="ios-list-text">
              <span className="ios-list-title">{t('analyze')}</span>
              <span className="ios-list-desc">{t('feat1Desc')}</span>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--ios-text-tertiary)', flexShrink: 0 }} />
          </button>
          <div className="ios-list-sep" />
          <button onClick={() => navigate('/guide')} className="ios-list-row">
            <div className="ios-list-icon" style={{ background: 'var(--ios-blue)' }}>
              <Activity size={17} color="#fff" />
            </div>
            <div className="ios-list-text">
              <span className="ios-list-title">{t('guide')}</span>
              <span className="ios-list-desc">{t('feat2Desc')}</span>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--ios-text-tertiary)', flexShrink: 0 }} />
          </button>
        </div>

        {/* ── How it works ── */}
        <div className="ios-section-label">{t('howItWorks').toUpperCase()}</div>
        <div className="ios-list-group">
          {[
            { n: '01', title: t('step1Title'), body: t('step1Body') },
            { n: '02', title: t('step2Title'), body: t('step2Body') },
            { n: '03', title: t('step3Title'), body: t('step3Body') },
          ].map(({ n, title, body }, i, arr) => (
            <div key={n}>
              <div className="ios-list-row" style={{ alignItems: 'flex-start', paddingTop: 14, paddingBottom: 14 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'var(--ios-fill-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ios-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ios-text-primary)', marginBottom: 3 }}>{title}</div>
                  <div style={{ fontSize: 13, color: 'var(--ios-text-secondary)', lineHeight: 1.5 }}>{body}</div>
                </div>
              </div>
              {i < arr.length - 1 && <div className="ios-list-sep" />}
            </div>
          ))}
        </div>

        {/* bottom spacing */}
        <div style={{ height: 8 }} />
      </div>
    </div>
  )
}
