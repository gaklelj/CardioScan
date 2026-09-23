import { Activity } from 'lucide-react'

const RISK_COLORS = {
  Low:      '#22c55e',
  Moderate: '#f59e0b',
  High:     '#f97316',
  Critical: '#ef4444',
}

const RISK_ORDER = ['Low', 'Moderate', 'High', 'Critical']

export default function RiskAssessmentCard({ riskData, loading, t }) {
  if (!loading && !riskData) return null

  if (loading) {
    return (
      <div
        className="border rounded-2xl overflow-hidden animate-fade-in"
        style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 18px' }}>
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--c-dim)', flexShrink: 0 }}>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <div>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--c-dim)' }}>
              {t('riskTitle')}
            </p>
            <p className="text-sm" style={{ color: 'var(--c-muted)', marginTop: '2px' }}>
              {t('riskPending')}
            </p>
          </div>
        </div>
        {/* Skeleton bars */}
        <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {RISK_ORDER.map((cls, i) => (
            <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '80px', fontSize: '12px', color: 'var(--c-dim)', flexShrink: 0 }}>
                {t(`risk${cls}`)}
              </span>
              <div style={{ flex: 1, height: '5px', background: 'var(--c-border)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${25 + i * 10}%`,
                  background: 'var(--c-border)',
                  borderRadius: '3px',
                  animation: 'shimmer 1.4s ease-in-out infinite',
                  opacity: 0.6,
                }} />
              </div>
              <span style={{ width: '36px', fontSize: '11px', color: 'var(--c-border)', textAlign: 'right' }}>—</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const { risk_class, mortality_10y, recommendation, probabilities } = riskData
  const color = RISK_COLORS[risk_class] ?? '#6b7280'

  return (
    <div
      className="border rounded-2xl overflow-hidden animate-fade-in"
      style={{ borderColor: `${color}44`, background: 'var(--c-card)' }}
    >
      {/* Colored header */}
      <div style={{
        background: `${color}12`,
        borderBottom: `1px solid ${color}30`,
        padding: '16px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--c-dim)', marginBottom: '4px' }}>
              {t('riskTitle')}
            </p>
            <p style={{ fontSize: '22px', fontWeight: 700, color, lineHeight: 1.1 }}>
              {t(`risk${risk_class}`)}
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p className="text-xs" style={{ color: 'var(--c-dim)', marginBottom: '4px' }}>
              {t('riskMortality')}
            </p>
            <p style={{ fontSize: '28px', fontWeight: 700, color, lineHeight: 1.1 }}>
              {mortality_10y}<span style={{ fontSize: '14px' }}>%</span>
            </p>
          </div>
        </div>
      </div>

      {/* Probability bars */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-border)' }}>
        {RISK_ORDER.map(cls => {
          const p = probabilities?.[cls] ?? 0
          const isActive = cls === risk_class
          return (
            <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
              <span style={{
                width: '80px', fontSize: '12px', flexShrink: 0,
                color: isActive ? RISK_COLORS[cls] : 'var(--c-dim)',
                fontWeight: isActive ? 600 : 400,
              }}>
                {t(`risk${cls}`)}
              </span>
              <div style={{ flex: 1, height: '5px', background: 'var(--c-border)', borderRadius: '3px' }}>
                <div style={{
                  width: `${(p * 100).toFixed(1)}%`,
                  height: '100%',
                  background: RISK_COLORS[cls],
                  borderRadius: '3px',
                  opacity: isActive ? 1 : 0.45,
                  transition: 'width 0.9s cubic-bezier(0.16, 1, 0.3, 1)',
                }} />
              </div>
              <span style={{
                width: '36px', fontSize: '11px', textAlign: 'right', flexShrink: 0,
                color: isActive ? RISK_COLORS[cls] : 'var(--c-dim)',
                fontWeight: isActive ? 600 : 400,
              }}>
                {(p * 100).toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>

      {/* Recommendation */}
      <div style={{ padding: '12px 18px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <Activity size={14} style={{ color, marginTop: '2px', flexShrink: 0 }} />
        <p style={{ fontSize: '13px', color: 'var(--c-muted)', lineHeight: 1.6 }}>
          {recommendation}
        </p>
      </div>
    </div>
  )
}
