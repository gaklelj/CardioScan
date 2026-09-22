import { useNavigate, useLocation } from 'react-router-dom'
import { Home, ScanLine, BookOpen } from 'lucide-react'
import { useLanguage } from '../LanguageContext'

const TABS = [
  { path: '/',        icon: Home,     labelKey: 'tabHome' },
  { path: '/analyze', icon: ScanLine,  labelKey: 'tabAnalyze' },
  { path: '/guide',   icon: BookOpen,  labelKey: 'tabGuide' },
]

export default function IOSTabBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLanguage()

  return (
    <div className="ios-tab-bar">
      {TABS.map(({ path, icon: Icon, labelKey }) => {
        const active = location.pathname === path
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="ios-tab-item"
            style={{ color: active ? 'var(--ios-blue)' : 'var(--ios-tab-inactive)' }}
          >
            <Icon size={24} strokeWidth={active ? 2.2 : 1.8} />
            <span className="ios-tab-label">{t(labelKey)}</span>
          </button>
        )
      })}
    </div>
  )
}
