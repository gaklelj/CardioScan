import { useState } from 'react'
import { Upload, Monitor, Activity } from 'lucide-react'
import Nav from '../components/Nav'
import ImageUpload from '../components/ImageUpload'
import LiveCapture from '../components/LiveCapture'
import EcgRealtime from '../components/EcgRealtime'
import { useLanguage } from '../LanguageContext'
import { usePlatform } from '../hooks/usePlatform'

const API_KEY      = 'WapH9HvnhmB00awLAv3N'
const MODEL        = 'ecg.analyze'
const VERSION      = '5'
const ANTHROPIC_KEY = 'YOUR_ANTHROPIC_API_KEY_HERE'

/* Decorative mini ECG strip shown above the tabs */
function EcgStrip() {
  return (
    <svg viewBox="0 0 400 28" className="w-full max-w-sm mx-auto opacity-50" fill="none" aria-hidden="true">
      <path
        className="ecg-mini"
        d="M0,14 L30,14 L42,14 L48,3 L54,25 L60,1 L66,23 L72,14 L92,14 L118,14 L130,14 L136,3 L142,25 L148,1 L154,23 L160,14 L180,14 L206,14 L218,14 L224,3 L230,25 L236,1 L242,23 L248,14 L268,14 L294,14 L306,14 L312,3 L318,25 L324,1 L330,23 L336,14 L356,14 L400,14"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: 'var(--c-dim)' }}
      />
    </svg>
  )
}

export default function Analyzer() {
  const [tab, setTab] = useState('realtime')
  const { t } = useLanguage()
  const { isIOS } = usePlatform()

  const tabs = [
    { v: 'realtime', label: t('tabRealtime'), Icon: Activity },
    { v: 'upload',   label: t('tabUpload'),   Icon: Upload },
    { v: 'live',     label: t('tabLive'),     Icon: Monitor },
  ]

  if (isIOS) {
    return (
      <div className="ios-page">
        <div className="ios-large-title-header" style={{ borderBottom: '0.5px solid var(--ios-separator)' }}>
          <h1 className="ios-large-title">{t('analyzerTitle')}</h1>
          <p className="ios-subtitle">{t('analyzerSubtitle')}</p>
        </div>
        <div className="ios-scroll-content">
          {/* Tab switcher */}
          <div style={{
            display: 'flex', background: 'var(--ios-fill-secondary)',
            borderRadius: 10, padding: 2, gap: 2, margin: '8px 0',
          }}>
            {tabs.map(({ v, label, Icon }) => (
              <button key={v} onClick={() => setTab(v)} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 5, padding: '8px 4px', borderRadius: 8, border: 'none',
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                background: tab === v ? 'var(--ios-bg-secondary)' : 'transparent',
                color: tab === v ? 'var(--ios-text-primary)' : 'var(--ios-text-secondary)',
                WebkitTapHighlightColor: 'transparent',
                transition: 'background 0.15s',
              }}>
                <Icon size={13} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
              </button>
            ))}
          </div>
          <div key={tab}>
            {tab === 'realtime' ? <EcgRealtime />
              : tab === 'upload' ? <ImageUpload apiKey={API_KEY} model={MODEL} version={VERSION} anthropicKey={ANTHROPIC_KEY} />
              : <LiveCapture />}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col w-full overflow-x-hidden" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>
      <Nav page="sub" title={t('analyzerTitle')} />

      <main className="flex-1 px-4 sm:px-6 py-8 sm:py-10 max-w-2xl mx-auto w-full">

        {/* Header */}
        <div className="mb-5 sm:mb-6 animate-fade-up animate-fade-up-1">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight mb-1">{t('analyzerTitle')}</h1>
          <p className="text-sm" style={{ color: 'var(--c-muted)' }}>
            {t('analyzerSubtitle')}
          </p>
        </div>

        {/* Decorative ECG strip */}
        <div className="animate-fade-up animate-fade-up-2 mb-5">
          <EcgStrip />
        </div>

        {/* Tab switcher */}
        <div
          className="animate-fade-up animate-fade-up-3 flex rounded-xl p-1 gap-1 mb-4 border"
          style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
        >
          {tabs.map(({ v, label, Icon }) => (
            <button
              key={v}
              onClick={() => setTab(v)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer min-w-0"
              style={
                tab === v
                  ? { background: 'var(--c-hover)', color: 'var(--c-text)' }
                  : { color: 'var(--c-dim)' }
              }
            >
              <Icon size={12} className="shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="animate-fade-up animate-fade-up-4 animate-fade-in" key={tab}>
          {tab === 'realtime'
            ? <EcgRealtime />
            : tab === 'upload'
              ? <ImageUpload apiKey={API_KEY} model={MODEL} version={VERSION} anthropicKey={ANTHROPIC_KEY} />
              : <LiveCapture />
          }
        </div>
      </main>

      <footer className="border-t px-4 sm:px-6 py-4 text-center" style={{ borderColor: 'var(--c-border)' }}>
        <p className="text-xs" style={{ color: 'var(--c-dim)' }}>
          {t('analyzerFooter')}
        </p>
      </footer>
    </div>
  )
}
