import { useNavigate } from 'react-router-dom'
import { ScanLine, ChevronRight, Activity, Zap } from 'lucide-react'
import heartImg from '../assets/Gemini_Generated_Image_f0mgkpf0mgkpf0mg-removebg-preview.png'
import { useLanguage } from '../LanguageContext'
import { useTheme } from '../ThemeContext'
import { Sun, Moon } from 'lucide-react'

const VITALS = [
  { label: 'Heart Rate', value: '72', unit: 'BPM', color: '#FF375F', glow: 'rgba(255,55,95,0.25)' },
  { label: 'SpO₂',       value: '98', unit: '%',   color: '#30D158', glow: 'rgba(48,209,88,0.25)' },
  { label: 'QRS',        value: '82', unit: 'ms',  color: '#0A84FF', glow: 'rgba(10,132,255,0.25)' },
]

function EcgLine() {
  return (
    <svg viewBox="0 0 300 36" fill="none" style={{ width: '100%' }}>
      <path
        d="M0,18 L24,18 L34,18 L38,5 L42,31 L46,2 L50,32 L54,18 L72,18
           L100,18 L110,18 L114,5 L118,31 L122,2 L126,32 L130,18 L148,18
           L176,18 L186,18 L190,5 L194,31 L198,2 L202,32 L206,18 L224,18 L300,18"
        stroke="#FF375F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        className="ecg-line"
      />
    </svg>
  )
}

const LANGS = ['en', 'ru', 'kz']

export default function IOSHome() {
  const navigate = useNavigate()
  const { t, lang, switchLang } = useLanguage()
  const { theme, toggle } = useTheme()

  return (
    <div className="ios-page">

      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 16px) 20px 12px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ios-text-secondary)', letterSpacing: '0.06em', marginBottom: 2 }}>
            CARDIOSCAN
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--ios-text-primary)', margin: 0, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            Dashboard
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Language switcher */}
          <div style={{
            display: 'flex', background: 'var(--ios-fill-secondary)',
            borderRadius: 20, padding: 2, gap: 1,
          }}>
            {LANGS.map(l => (
              <button key={l} onClick={() => switchLang(l)} style={{
                padding: '4px 9px', borderRadius: 16, border: 'none',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: lang === l ? 'var(--ios-bg-secondary)' : 'transparent',
                color: lang === l ? 'var(--ios-text-primary)' : 'var(--ios-text-secondary)',
                WebkitTapHighlightColor: 'transparent',
                transition: 'background 0.15s',
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
              }}>
                {l}
              </button>
            ))}
          </div>
          {/* Theme toggle */}
          <button onClick={toggle} style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: 'var(--ios-fill-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ios-text-secondary)', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>

      <div className="ios-scroll-content">

        {/* ── Hero Card ── */}
        <div style={{
          borderRadius: 24,
          background: 'linear-gradient(160deg, #1a0a10 0%, #0d0d0f 60%)',
          overflow: 'hidden',
          marginBottom: 12,
          border: '0.5px solid rgba(255,55,95,0.2)',
          position: 'relative',
        }}>
          {/* Background glow */}
          <div style={{
            position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
            width: 280, height: 280,
            background: 'radial-gradient(circle, rgba(255,55,95,0.15) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />

          {/* Heart area */}
          <div style={{
            position: 'relative', height: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {[100, 130, 160].map((size, i) => (
              <div key={i} className={`ring-${i + 1}`} style={{
                position: 'absolute', width: size, height: size, borderRadius: '50%',
                border: '1px solid rgba(255,55,95,0.18)',
              }} />
            ))}
            <img
              src={heartImg} alt="heart"
              className="heart-float heart-beat"
              style={{
                width: 150, height: 150, objectFit: 'contain', position: 'relative', zIndex: 1,
                filter: 'drop-shadow(0 0 24px rgba(255,55,95,0.6)) drop-shadow(0 4px 16px rgba(0,0,0,0.8))',
              }}
            />
            {/* Live badge */}
            <div style={{
              position: 'absolute', top: 16, right: 16,
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(48,209,88,0.12)', borderRadius: 20,
              padding: '4px 10px 4px 8px',
              border: '0.5px solid rgba(48,209,88,0.3)',
            }}>
              <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#30D158' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#30D158', letterSpacing: '0.02em' }}>LIVE</span>
            </div>
          </div>

          {/* BPM + ECG */}
          <div style={{ padding: '0 20px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500, letterSpacing: '0.08em', marginBottom: 1 }}>HEART RATE</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 42, fontWeight: 700, color: '#FF375F', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    textShadow: '0 0 20px rgba(255,55,95,0.5)' }}>72</span>
                  <span style={{ fontSize: 14, color: 'rgba(255,55,95,0.7)', fontWeight: 600 }}>BPM</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500, letterSpacing: '0.08em', marginBottom: 1 }}>RHYTHM</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Normal Sinus</div>
              </div>
            </div>
            <div style={{ opacity: 0.9 }}>
              <EcgLine />
            </div>
          </div>
        </div>

        {/* ── Vitals Row ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {VITALS.map(({ label, value, unit, color, glow }) => (
            <div key={label} style={{
              flex: 1, borderRadius: 18,
              background: 'var(--ios-card-bg)',
              padding: '14px 12px 16px',
              border: `0.5px solid ${glow}`,
              minWidth: 0,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', bottom: -20, right: -20,
                width: 70, height: 70, borderRadius: '50%',
                background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
                filter: 'blur(6px)', pointerEvents: 'none',
              }} />
              <div style={{ fontSize: 9, color: 'var(--ios-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontWeight: 600 }}>
                {label}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
                <span style={{ fontSize: 11, color, opacity: 0.7, fontWeight: 500, paddingBottom: 2 }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Quick Actions ── */}
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-text-secondary)', letterSpacing: '0.04em', margin: '20px 4px 8px' }}>
          QUICK ACTIONS
        </div>
        <div style={{ borderRadius: 18, overflow: 'hidden', background: 'var(--ios-card-bg)' }}>
          <button onClick={() => navigate('/analyze')} className="ios-list-row">
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg, #FF375F, #d42e52)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 2px 8px rgba(255,55,95,0.35)',
            }}>
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
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg, #0A84FF, #0066cc)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 2px 8px rgba(10,132,255,0.35)',
            }}>
              <Activity size={17} color="#fff" />
            </div>
            <div className="ios-list-text">
              <span className="ios-list-title">{t('guide')}</span>
              <span className="ios-list-desc">{t('feat2Desc')}</span>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--ios-text-tertiary)', flexShrink: 0 }} />
          </button>
          <div className="ios-list-sep" />
          <button onClick={() => navigate('/serial')} className="ios-list-row">
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg, #30D158, #25a344)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 2px 8px rgba(48,209,88,0.35)',
            }}>
              <Zap size={17} color="#fff" />
            </div>
            <div className="ios-list-text">
              <span className="ios-list-title">Live Monitor</span>
              <span className="ios-list-desc">Real-time ECG via Arduino</span>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--ios-text-tertiary)', flexShrink: 0 }} />
          </button>
        </div>

        {/* ── How it works ── */}
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ios-text-secondary)', letterSpacing: '0.04em', margin: '20px 4px 8px' }}>
          {t('howItWorks').toUpperCase()}
        </div>
        <div style={{ borderRadius: 18, overflow: 'hidden', background: 'var(--ios-card-bg)' }}>
          {[
            { n: '01', title: t('step1Title'), body: t('step1Body'), color: '#FF375F' },
            { n: '02', title: t('step2Title'), body: t('step2Body'), color: '#0A84FF' },
            { n: '03', title: t('step3Title'), body: t('step3Body'), color: '#30D158' },
          ].map(({ n, title, body, color }, i, arr) => (
            <div key={n}>
              <div style={{ display: 'flex', gap: 14, padding: '14px 16px', alignItems: 'flex-start' }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 9,
                  background: `${color}1a`,
                  border: `1px solid ${color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                </div>
                <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ios-text-primary)', marginBottom: 3 }}>{title}</div>
                  <div style={{ fontSize: 13, color: 'var(--ios-text-secondary)', lineHeight: 1.5 }}>{body}</div>
                </div>
              </div>
              {i < arr.length - 1 && <div className="ios-list-sep" style={{ marginLeft: 60 }} />}
            </div>
          ))}
        </div>

        <div style={{ height: 16 }} />
      </div>
    </div>
  )
}
