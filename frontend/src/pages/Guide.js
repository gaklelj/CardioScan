import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import Nav from '../components/Nav'
import { useLanguage } from '../LanguageContext'
import electrodsImg from '../assets/electrods.jpg'

/* Thin ECG wave used as section divider */
function EcgDivider() {
  return (
    <svg viewBox="0 0 320 20" className="w-full" fill="none" aria-hidden="true">
      <path
        className="ecg-mini"
        d="M0,10 L40,10 L50,10 L55,2 L60,18 L65,1 L70,17 L75,10 L95,10 L130,10 L140,10 L145,2 L150,18 L155,1 L160,17 L165,10 L185,10 L220,10 L230,10 L235,2 L240,18 L245,1 L250,17 L255,10 L275,10 L320,10"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: 'var(--c-dim)' }}
      />
    </svg>
  )
}

export default function Guide() {
  const navigate = useNavigate()
  const { t } = useLanguage()

  const placements = [
    { id: 'RA',    label: t('raLabel'), desc: t('raDesc') },
    { id: 'LA',    label: t('laLabel'), desc: t('laDesc') },
    { id: 'RL',    label: t('rlLabel'), desc: t('rlDesc') },
    { id: 'LL',    label: t('llLabel'), desc: t('llDesc') },
    { id: 'V1–V6', label: t('v1Label'), desc: t('v1Desc') },
  ]

  const tips = [t('tip1'), t('tip2'), t('tip3'), t('tip4'), t('tip5')]

  const faq = [
    { q: t('faq1q'), a: t('faq1a') },
    { q: t('faq2q'), a: t('faq2a') },
    { q: t('faq3q'), a: t('faq3a') },
    { q: t('faq4q'), a: t('faq4a') },
  ]

  const arduinoSteps = [t('aStep1'), t('aStep2'), t('aStep3'), t('aStep4')]

  return (
    <div className="min-h-screen flex flex-col w-full overflow-x-hidden" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>
      <Nav page="sub" title={t('guide')} />

      <main className="flex-1 px-4 sm:px-6 py-10 sm:py-12 max-w-2xl mx-auto w-full space-y-10 sm:space-y-12">

        {/* Header */}
        <div className="animate-fade-up animate-fade-up-1">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mb-2">{t('guideTitle')}</h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--c-muted)' }}>
            {t('guideSubtitle')}
          </p>
        </div>

        {/* Decorative divider */}
        <div className="animate-fade-up animate-fade-up-2">
          <EcgDivider />
        </div>

        {/* Disclaimer */}
        <div
          className="animate-fade-up animate-fade-up-2 flex gap-3 border rounded-xl px-4 py-4"
          style={{ background: 'var(--c-warn-bg)', borderColor: 'var(--c-warn-border)' }}
        >
          <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--c-muted)' }}>
            {t('guideDisclaimer')}
          </p>
        </div>

        {/* Electrode placement */}
        <section className="animate-fade-up animate-fade-up-3 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--c-dim)' }}>{t('electrodePlacementLabel')}</p>
            <h2 className="text-base font-medium">{t('electrodePlacementTitle')}</h2>
          </div>
          <div className="border rounded-2xl overflow-hidden" style={{ borderColor: 'var(--c-border)' }}>
            <img src={electrodsImg} alt="Electrode placement diagram" className="w-full object-cover max-h-64 sm:max-h-72" />
          </div>
          <div>
            {placements.map(({ id, label, desc }) => (
              <div key={id} className="flex items-start gap-3 sm:gap-4 py-3.5 border-b last:border-0" style={{ borderColor: 'var(--c-border)' }}>
                <span className="font-mono text-xs w-10 shrink-0 pt-0.5" style={{ color: 'var(--c-dim)' }}>{id}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--c-text)' }}>{label}</p>
                  <p className="text-xs" style={{ color: 'var(--c-muted)' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ECG divider */}
        <EcgDivider />

        {/* Tips */}
        <section className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--c-dim)' }}>{t('bestPracticesLabel')}</p>
            <h2 className="text-base font-medium">{t('bestPracticesTitle')}</h2>
          </div>
          <div className="space-y-3">
            {tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--c-dim)' }} />
                <p className="text-sm leading-relaxed" style={{ color: 'var(--c-muted)' }}>{tip}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Arduino */}
        <section className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--c-dim)' }}>{t('arduinoLabel')}</p>
            <h2 className="text-base font-medium">{t('arduinoTitle')}</h2>
          </div>
          <div className="border rounded-2xl p-4 sm:p-5 space-y-4" style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--c-muted)' }}>
              {t('arduinoBody')}{' '}
              <strong style={{ color: 'var(--c-text)' }}>{t('arduinoBodyLiveCaptureLink')}</strong>{' '}
              {t('arduinoBodyEnd')}
            </p>
            <div className="space-y-2">
              {arduinoSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xs font-mono shrink-0 mt-0.5" style={{ color: 'var(--c-dim)' }}>{String(i + 1).padStart(2, '0')}</span>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--c-muted)' }}>{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ECG divider */}
        <EcgDivider />

        {/* FAQ */}
        <section className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--c-dim)' }}>{t('faqLabel')}</p>
            <h2 className="text-base font-medium">{t('faqTitle')}</h2>
          </div>
          <div>
            {faq.map(({ q, a }) => (
              <div key={q} className="py-5 border-b last:border-0" style={{ borderColor: 'var(--c-border)' }}>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--c-text)' }}>{q}</p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--c-muted)' }}>{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="border rounded-2xl p-6 sm:p-8 text-center" style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
          <h3 className="text-base font-medium mb-2">{t('guideCtaTitle')}</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--c-muted)' }}>{t('guideCtaBody')}</p>
          <button
            onClick={() => navigate('/analyze')}
            className="inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
            style={{ background: 'var(--c-accent)', color: 'var(--c-accent-fg)' }}
          >
            {t('openAnalyzer')}
          </button>
        </div>

      </main>

      <footer className="border-t px-4 sm:px-6 py-4 text-center" style={{ borderColor: 'var(--c-border)' }}>
        <p className="text-xs" style={{ color: 'var(--c-dim)' }}>{t('guideFooter')}</p>
      </footer>
    </div>
  )
}
