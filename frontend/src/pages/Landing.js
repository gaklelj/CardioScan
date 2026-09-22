import { useNavigate } from 'react-router-dom'
import { Monitor, Zap, ArrowRight, FileImage, BookOpen } from 'lucide-react'
import Nav from '../components/Nav'
import HeartAnatomy from '../components/HeartAnatomy'
import { useLanguage } from '../LanguageContext'

/* ── Scanning ECG hero line ── */
function EcgHero() {
  return (
    <svg viewBox="0 0 600 80" className="w-full" fill="none" aria-hidden="true">
      <path
        className="ecg-line"
        d="M0,40 L55,40 L70,40 L78,8 L86,72 L94,2 L102,68 L110,40 L140,40
           L185,40 L200,40 L208,8 L216,72 L224,2 L232,68 L240,40 L270,40
           L315,40 L330,40 L338,8 L346,72 L354,2 L362,68 L370,40 L400,40
           L445,40 L460,40 L468,8 L476,72 L484,2 L492,68 L500,40 L600,40"
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ color: 'var(--c-muted)' }}
      />
    </svg>
  )
}

/* ── Small ECG for cards ── */
function EcgMini() {
  return (
    <svg viewBox="0 0 160 32" className="w-full" fill="none" aria-hidden="true">
      <path
        className="ecg-mini"
        d="M0,16 L20,16 L28,16 L32,4 L36,28 L40,2 L44,26 L48,16 L62,16
           L80,16 L88,16 L92,4 L96,28 L100,2 L104,26 L108,16 L122,16
           L140,16 L148,16 L152,4 L156,28 L160,16"
        stroke="currentColor" strokeWidth="1"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ color: 'var(--c-dim)' }}
      />
    </svg>
  )
}

/* ── Heart with pulsing rings + radar grid ── */
function HeartViz() {
  return (
    <div className="relative w-full" style={{ aspectRatio: '1 / 1.05' }}>

      {/* Radar grid */}
      <svg
        viewBox="0 0 300 300"
        className="absolute inset-0 w-full h-full"
        fill="none" aria-hidden="true"
      >
        {[36, 72, 108, 144].map((r) => (
          <circle key={r} cx="150" cy="150" r={r}
            stroke="var(--c-border)" strokeWidth="0.6" opacity="0.55" />
        ))}
        <line x1="150" y1="6"   x2="150" y2="294" stroke="var(--c-border)" strokeWidth="0.5" opacity="0.35" />
        <line x1="6"   y1="150" x2="294" y2="150" stroke="var(--c-border)" strokeWidth="0.5" opacity="0.35" />
        <line x1="48"  y1="48"  x2="252" y2="252" stroke="var(--c-border)" strokeWidth="0.4" opacity="0.18" />
        <line x1="252" y1="48"  x2="48"  y2="252" stroke="var(--c-border)" strokeWidth="0.4" opacity="0.18" />
        {[0, 90, 180, 270].map((deg) => {
          const rad = (deg * Math.PI) / 180
          return (
            <line key={deg}
              x1={150 + 144 * Math.cos(rad)} y1={150 + 144 * Math.sin(rad)}
              x2={150 + 154 * Math.cos(rad)} y2={150 + 154 * Math.sin(rad)}
              stroke="var(--c-dim)" strokeWidth="1.2" opacity="0.45" />
          )
        })}
      </svg>

      {/* Pulsing rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {['ring-1', 'ring-2', 'ring-3'].map((cls) => (
          <span key={cls} className={`absolute rounded-full ${cls}`}
            style={{ width: '62%', height: '62%', border: '1px solid rgba(192,57,43,0.45)' }} />
        ))}
      </div>

      {/* Red ambient glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ filter: 'blur(30px)' }}>
        <div style={{
          width: '50%', height: '50%',
          background: 'radial-gradient(circle, rgba(160,30,20,0.30) 0%, transparent 70%)',
        }} />
      </div>

      {/* Heart */}
      <div className="absolute inset-0 flex items-center justify-center">
        <HeartAnatomy
          className="heart-float heart-beat"
          style={{ width: '74%', height: '74%', filter: 'drop-shadow(0 0 20px rgba(140,20,10,0.60))' }}
        />
      </div>

      {/* Decorative measurement labels */}
      <div className="absolute top-[11%] right-[7%] text-right pointer-events-none select-none"
        style={{ color: 'var(--c-dim)', fontSize: '9px', lineHeight: 1.65, letterSpacing: '0.05em' }}>
        <div style={{ opacity: 0.65 }}>SYSTOLE</div>
        <div style={{ color: '#e74c3c', opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>72 BPM</div>
      </div>
      <div className="absolute bottom-[13%] left-[5%] pointer-events-none select-none"
        style={{ color: 'var(--c-dim)', fontSize: '9px', lineHeight: 1.65, letterSpacing: '0.05em' }}>
        <div style={{ opacity: 0.65 }}>NORMAL SINUS</div>
        <div style={{ opacity: 0.45 }}>RHYTHM</div>
      </div>

      {/* Label leader lines */}
      <svg viewBox="0 0 300 300"
        className="absolute inset-0 w-full h-full pointer-events-none"
        fill="none" aria-hidden="true">
        <line x1="202" y1="72" x2="244" y2="52" stroke="var(--c-dim)" strokeWidth="0.7" opacity="0.38" />
        <circle cx="244" cy="52" r="1.5" fill="var(--c-dim)" opacity="0.38" />
        <line x1="100" y1="70" x2="58" y2="52" stroke="var(--c-dim)" strokeWidth="0.7" opacity="0.38" />
        <circle cx="58" cy="52" r="1.5" fill="var(--c-dim)" opacity="0.38" />
        <line x1="148" y1="282" x2="112" y2="296" stroke="var(--c-dim)" strokeWidth="0.7" opacity="0.3" />
        <circle cx="112" cy="296" r="1.5" fill="var(--c-dim)" opacity="0.3" />
      </svg>
    </div>
  )
}

/* ── Vessel-like decorative divider ── */
function VesselDivider() {
  return (
    <svg viewBox="0 0 800 52" className="w-full" fill="none" aria-hidden="true"
      style={{ opacity: 0.16 }}>
      <path
        d="M0,26 C80,26 96,14 136,14 C176,14 182,38 222,38 C262,38 268,20 308,20
           C348,20 350,34 390,34 C430,34 432,16 472,16 C512,16 514,32 554,32
           C594,32 596,18 636,18 C676,18 720,26 800,26"
        stroke="var(--c-muted)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M 308,20 C 313,12 316,5 322,2"
        stroke="var(--c-muted)" strokeWidth="1" strokeLinecap="round" />
      <path d="M 472,16 C 477,24 479,34 485,40"
        stroke="var(--c-muted)" strokeWidth="1" strokeLinecap="round" />
      {[156, 285, 424, 564].map((x) => (
        <circle key={x} cx={x} cy={26} r="2.5" fill="var(--c-muted)" opacity="0.55" />
      ))}
    </svg>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const { t } = useLanguage()

  const features = [
    { icon: FileImage, title: t('feat1Title'), desc: t('feat1Desc') },
    { icon: Monitor,   title: t('feat2Title'), desc: t('feat2Desc') },
    { icon: Zap,       title: t('feat3Title'), desc: t('feat3Desc') },
  ]

  const steps = [
    { n: '01', title: t('step1Title'), body: t('step1Body') },
    { n: '02', title: t('step2Title'), body: t('step2Body') },
    { n: '03', title: t('step3Title'), body: t('step3Body') },
  ]

  return (
    <div className="min-h-screen flex flex-col w-full overflow-x-hidden"
      style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>
      <Nav page="root" />

      {/* ═══════════════════ HERO ═══════════════════ */}
      <section className="flex-1 px-4 sm:px-6 pt-12 sm:pt-16 pb-4 max-w-5xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">

          {/* Left — text */}
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left">
            <div
              className="animate-fade-up animate-fade-up-1 inline-flex items-center gap-2 border rounded-full px-3 py-1 text-xs mb-6"
              style={{ borderColor: 'var(--c-border)', color: 'var(--c-dim)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot inline-block" />
              Roboflow AI · ecg.analyze v5
            </div>

            <h1 className="animate-fade-up animate-fade-up-2 text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.1] mb-5">
              {t('heroTitle1')}<br />
              <span style={{ color: 'var(--c-border-sub)' }}>{t('heroTitle2')}</span>
            </h1>

            <p className="animate-fade-up animate-fade-up-3 text-base sm:text-lg leading-relaxed mb-8 max-w-md"
              style={{ color: 'var(--c-muted)' }}>
              {t('heroSubtitle').split('\n').map((line, i, arr) => (
                <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
              ))}
            </p>

            <div className="animate-fade-up animate-fade-up-4 flex flex-wrap justify-center lg:justify-start items-center gap-3">
              <button
                onClick={() => navigate('/analyze')}
                className="flex items-center gap-2 font-medium px-6 py-3 rounded-xl transition-colors cursor-pointer text-sm"
                style={{ background: 'var(--c-accent)', color: 'var(--c-accent-fg)' }}
              >
                {t('startAnalyzing')}<ArrowRight size={14} />
              </button>
              <button
                onClick={() => navigate('/guide')}
                className="flex items-center gap-2 border font-medium px-6 py-3 rounded-xl transition-colors cursor-pointer text-sm"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
              >
                <BookOpen size={13} />{t('readGuide')}
              </button>
            </div>

            {/* Live vital-sign badges */}
            <div className="animate-fade-up animate-fade-up-4 flex flex-wrap items-center gap-2.5 mt-7 justify-center lg:justify-start">
              {[
                { label: 'HR',   value: '72 bpm', color: '#e74c3c' },
                { label: 'SpO₂', value: '98 %',   color: '#27ae60' },
                { label: 'QRS',  value: '82 ms',   color: 'var(--c-muted)' },
              ].map(({ label, value, color }) => (
                <div key={label}
                  className="flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5"
                  style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
                  <span className="text-[9px] uppercase tracking-widest"
                    style={{ color: 'var(--c-dim)' }}>{label}</span>
                  <span className="text-xs font-mono font-medium"
                    style={{ color }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — anatomical heart */}
          <div className="animate-fade-in w-52 sm:w-64 lg:w-80 shrink-0">
            <HeartViz />
          </div>
        </div>

        {/* ECG scan strip */}
        <div className="mt-8 sm:mt-10" style={{ opacity: 0.65 }}>
          <EcgHero />
        </div>
      </section>

      {/* ═══════════════════ VESSEL DIVIDER ═══════════════════ */}
      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-2">
        <VesselDivider />
      </div>

      {/* ═══════════════════ FEATURES ═══════════════════ */}
      <section className="px-4 sm:px-6 py-12 sm:py-14 max-w-4xl mx-auto w-full">
        <p className="text-xs uppercase tracking-widest mb-6 sm:mb-8 text-center"
          style={{ color: 'var(--c-dim)' }}>{t('whatItDoes')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {features.map(({ icon: Icon, title, desc }, i) => (
            <div key={i}
              className="rounded-2xl p-5 sm:p-6 border relative overflow-hidden"
              style={{ background: 'var(--c-card)', borderColor: 'var(--c-border)' }}>
              {/* Faint heart watermark */}
              <div className="absolute -bottom-3 -right-3 pointer-events-none"
                style={{ opacity: 0.04 }} aria-hidden="true">
                <HeartAnatomy style={{ width: 88, height: 100 }} />
              </div>
              <div className="relative">
                <div className="w-9 h-9 rounded-xl border flex items-center justify-center mb-4"
                  style={{ borderColor: 'var(--c-border)' }}>
                  <Icon size={15} style={{ color: 'var(--c-muted)' }} />
                </div>
                <h3 className="text-sm font-medium mb-2"
                  style={{ color: 'var(--c-text)' }}>{title}</h3>
                <p className="text-sm leading-relaxed mb-4"
                  style={{ color: 'var(--c-muted)' }}>{desc}</p>
                <EcgMini />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ HOW IT WORKS ═══════════════════ */}
      <section className="px-4 sm:px-6 py-12 sm:py-14 max-w-4xl mx-auto w-full border-t"
        style={{ borderColor: 'var(--c-border)' }}>
        <p className="text-xs uppercase tracking-widest mb-6 sm:mb-8 text-center"
          style={{ color: 'var(--c-dim)' }}>{t('howItWorks')}</p>
        <div>
          {steps.map(({ n, title, body }) => (
            <div key={n}
              className="flex gap-4 sm:gap-6 py-5 sm:py-6 border-b last:border-0"
              style={{ borderColor: 'var(--c-border)' }}>
              <span className="text-xs font-mono w-6 shrink-0 pt-0.5"
                style={{ color: 'var(--c-dim)' }}>{n}</span>
              <div className="min-w-0">
                <h4 className="text-sm font-medium mb-1"
                  style={{ color: 'var(--c-text)' }}>{title}</h4>
                <p className="text-sm leading-relaxed"
                  style={{ color: 'var(--c-muted)' }}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ CTA ═══════════════════ */}
      <section className="px-4 sm:px-6 pb-12 sm:pb-16 max-w-4xl mx-auto w-full">
        <div className="border rounded-2xl p-7 sm:p-10 text-center relative overflow-hidden"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
          {/* Background heart watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ opacity: 0.04 }} aria-hidden="true">
            <HeartAnatomy style={{ width: 260, height: 290 }} />
          </div>
          <div className="relative">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-3">
              {t('ctaTitle')}
            </h2>
            <p className="text-sm mb-5 sm:mb-6"
              style={{ color: 'var(--c-muted)' }}>{t('ctaBody')}</p>
            <button
              onClick={() => navigate('/analyze')}
              className="inline-flex items-center gap-2 font-medium px-6 py-3 rounded-xl transition-colors cursor-pointer text-sm"
              style={{ background: 'var(--c-accent)', color: 'var(--c-accent-fg)' }}
            >
              {t('openAnalyzer')} <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      <footer
        className="border-t px-4 sm:px-6 py-4 sm:py-5 max-w-4xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-1 text-center sm:text-left"
        style={{ borderColor: 'var(--c-border)' }}>
        <p className="text-xs" style={{ color: 'var(--c-dim)' }}>CardioScan</p>
        <p className="text-xs" style={{ color: 'var(--c-dim)' }}>{t('footerDisclaimer')}</p>
      </footer>
    </div>
  )
}
