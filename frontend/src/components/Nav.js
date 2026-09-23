import { useNavigate } from 'react-router-dom'
import { Activity, ArrowLeft, Sun, Moon, ArrowRight, Usb, Clock } from 'lucide-react'
import { useTheme } from '../ThemeContext'
import { useLanguage } from '../LanguageContext'

const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__)

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'kz', label: 'KZ' },
]

export default function Nav({ page = 'root', title }) {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const { lang, switchLang, t } = useLanguage()

  return (
    <nav
      className="sticky top-0 z-50 border-b nav-bg px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 w-full max-w-full overflow-hidden"
      style={{ borderColor: 'var(--c-border)', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
    >
      {/* Left */}
      {page === 'root' ? (
        <div
          className="flex items-center gap-2 cursor-pointer shrink-0"
          onClick={() => navigate('/')}
        >
          <Activity size={17} className="heartbeat" style={{ color: 'var(--c-text)' }} />
          <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--c-text)' }}>
            CardioScan
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 transition-colors cursor-pointer text-sm shrink-0"
            style={{ color: 'var(--c-muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--c-text)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--c-muted)'}
          >
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">{t('back')}</span>
          </button>
          <span className="shrink-0" style={{ color: 'var(--c-border-sub)' }}>/</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <Activity size={14} className="shrink-0" style={{ color: 'var(--c-text)' }} />
            <span
              className="text-sm font-medium truncate"
              style={{ color: 'var(--c-text)' }}
            >
              {title}
            </span>
          </div>
        </div>
      )}

      {/* Right */}
      <div className="flex items-center gap-2 shrink-0">
        {page === 'root' && (
          <>
            <button
              onClick={() => navigate('/guide')}
              className="text-sm transition-colors cursor-pointer hidden sm:block"
              style={{ color: 'var(--c-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--c-dim)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--c-muted)'}
            >
              {t('guide')}
            </button>
            <button
              onClick={() => navigate('/history')}
              className="flex items-center gap-1.5 text-sm transition-colors cursor-pointer hidden sm:flex"
              style={{ color: 'var(--c-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--c-text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--c-muted)'}
            >
              <Clock size={13} />
              <span>{t('history')}</span>
            </button>
            {isTauri && (
              <button
                onClick={() => navigate('/serial')}
                className="flex items-center gap-1.5 text-sm transition-colors cursor-pointer border rounded-lg px-3 py-2 hidden sm:flex"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--c-text)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--c-muted)'}
              >
                <Usb size={13} />
                <span>Serial</span>
              </button>
            )}
            <button
              onClick={() => navigate('/analyze')}
              className="flex items-center gap-1.5 text-sm font-medium px-3 sm:px-4 py-2 rounded-lg transition-colors cursor-pointer"
              style={{ background: 'var(--c-accent)', color: 'var(--c-accent-fg)' }}
            >
              <span className="hidden sm:inline">{t('analyze')}</span>
              <ArrowRight size={13} />
            </button>
          </>
        )}

        {page !== 'root' && (
          <span
            className="text-xs border rounded-full px-3 py-1 hidden md:block"
            style={{ color: 'var(--c-dim)', borderColor: 'var(--c-border)' }}
          >
            ecg.analyze · v5
          </span>
        )}

        {/* Language switcher */}
        <div
          className="flex border rounded-lg overflow-hidden"
          style={{ borderColor: 'var(--c-border)' }}
        >
          {LANGS.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => switchLang(code)}
              className="px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs font-medium transition-colors cursor-pointer"
              style={{
                background: lang === code ? 'var(--c-hover)' : 'transparent',
                color: lang === code ? 'var(--c-text)' : 'var(--c-dim)',
                borderRight: code !== 'kz' ? '1px solid var(--c-border)' : 'none',
                minHeight: '28px',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0"
          style={{ border: '1px solid var(--c-border)', color: 'var(--c-dim)' }}
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>
    </nav>
  )
}
