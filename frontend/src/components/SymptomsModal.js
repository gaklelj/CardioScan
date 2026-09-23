import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Check, Heart, Minus, Plus } from 'lucide-react'

const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)

// ── Rose questionnaire questions ──────────────────────────────────────────────
const Q_DEFS = [
  { id: 'sq1', type: 'single', optCount: 2 },
  { id: 'sq2', type: 'single', optCount: 4, showIf: (a) => a.sq1 === 0 },
  { id: 'sq3', type: 'multi',  optCount: 3, showIf: (a) => a.sq1 === 0 },
  { id: 'sq4', type: 'single', optCount: 3, showIf: (a) => a.sq1 === 0 },
  { id: 'sq5', type: 'single', optCount: 2, showIf: (a) => a.sq1 === 0 && a.sq4 !== undefined && a.sq4 !== 2 },
  { id: 'sq6', type: 'single', optCount: 2, showIf: (a) => a.sq1 === 0 },
]

const DEFAULT_DEMO = { age: 45, sex: 0, sbp: 120, cholesterol: 5.0, smoking: 0 }

// Compute rose_flag from Rose questionnaire answers
function computeRoseFlag(answers) {
  return (
    answers.sq1 === 0 &&
    answers.sq2 !== undefined && answers.sq2 !== 3 &&
    answers.sq4 !== undefined && answers.sq4 !== 2 &&
    answers.sq6 === 1 &&
    answers.sq5 === 0 &&
    (answers.sq3 || []).some(i => i === 0 || i === 1)
  ) ? 1 : 0
}

export function buildReadableSymptoms(answers, t) {
  const result = []
  Q_DEFS.filter(q => !q.showIf || q.showIf(answers)).forEach(q => {
    if (answers[q.id] === undefined) return
    const question = t(q.id)
    const answer = q.type === 'multi'
      ? (answers[q.id] || []).map(i => t(`${q.id}opt${i + 1}`)).join(', ')
      : t(`${q.id}opt${answers[q.id] + 1}`)
    result.push({ question, answer })
  })
  return result
}

// ── SymptomsCard (shown in results) ──────────────────────────────────────────
export function SymptomsCard({ symptoms, t }) {
  if (!symptoms || symptoms.length === 0) return null
  return (
    <div
      className="border rounded-2xl overflow-hidden animate-fade-in"
      style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
        <Heart size={13} color="#ef4444" />
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--c-dim)' }}>
          {t('sqSymptomsCard')}
        </p>
      </div>
      <div className="p-4 space-y-3">
        {symptoms.map(({ question, answer }, i) => (
          <div key={i}>
            <p className="text-xs mb-1" style={{ color: 'var(--c-dim)' }}>{question}</p>
            <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{answer}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Demographics form (Step 1) ────────────────────────────────────────────────
function DemographicsStep({ demo, onChange, t }) {
  const pill = (active) => ({
    flex: 1, padding: '9px 8px', borderRadius: '10px', cursor: 'pointer',
    fontSize: '13px', fontWeight: 500, border: 'none',
    background: active ? 'var(--c-accent)' : 'var(--c-border)',
    color: active ? 'var(--c-accent-fg)' : 'var(--c-dim)',
    transition: 'all 0.15s ease',
  })

  const rowStyle = { marginBottom: '16px' }
  const labelStyle = { fontSize: '12px', color: 'var(--c-dim)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
  const valueStyle = { fontSize: '13px', fontWeight: 600, color: 'var(--c-text)' }

  return (
    <div style={{ padding: '6px 18px 4px' }}>

      {/* Age */}
      <div style={rowStyle}>
        <div style={labelStyle}>
          <span>{t('sqAge')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => onChange('age', Math.max(18, demo.age - 1))}
            style={{
              width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--c-border)', background: 'transparent', cursor: 'pointer', color: 'var(--c-muted)',
            }}
          ><Minus size={14} /></button>
          <span style={{ ...valueStyle, fontSize: '22px', minWidth: '48px', textAlign: 'center' }}>{demo.age}</span>
          <button
            onClick={() => onChange('age', Math.min(100, demo.age + 1))}
            style={{
              width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--c-border)', background: 'transparent', cursor: 'pointer', color: 'var(--c-muted)',
            }}
          ><Plus size={14} /></button>
          <span style={{ fontSize: '12px', color: 'var(--c-dim)' }}>{t('sqAgeUnit')}</span>
        </div>
      </div>

      {/* Sex */}
      <div style={rowStyle}>
        <div style={labelStyle}><span>{t('sqSex')}</span></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => onChange('sex', 0)} style={pill(demo.sex === 0)}>{t('sqSexF')}</button>
          <button onClick={() => onChange('sex', 1)} style={pill(demo.sex === 1)}>{t('sqSexM')}</button>
        </div>
      </div>

      {/* SBP */}
      <div style={rowStyle}>
        <div style={labelStyle}>
          <span>{t('sqSbp')}</span>
          <span style={valueStyle}>{demo.sbp} {t('sqSbpUnit')}</span>
        </div>
        <input
          type="range" min="90" max="200" step="1"
          value={demo.sbp}
          onChange={e => onChange('sbp', +e.target.value)}
          className="risk-slider"
          style={{ width: '100%', accentColor: '#ef4444' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--c-dim)' }}>90</span>
          <span style={{ fontSize: '10px', color: 'var(--c-dim)' }}>200</span>
        </div>
      </div>

      {/* Cholesterol */}
      <div style={rowStyle}>
        <div style={labelStyle}>
          <span>{t('sqCholesterol')}</span>
          <span style={valueStyle}>{demo.cholesterol.toFixed(1)} {t('sqCholUnit')}</span>
        </div>
        <input
          type="range" min="3" max="8" step="0.1"
          value={demo.cholesterol}
          onChange={e => onChange('cholesterol', +parseFloat(e.target.value).toFixed(1))}
          className="risk-slider"
          style={{ width: '100%', accentColor: '#ef4444' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--c-dim)' }}>3.0</span>
          <span style={{ fontSize: '10px', color: 'var(--c-dim)' }}>8.0</span>
        </div>
      </div>

      {/* Smoking */}
      <div style={{ ...rowStyle, marginBottom: 0 }}>
        <div style={labelStyle}><span>{t('sqSmoking')}</span></div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => onChange('smoking', 0)} style={pill(demo.smoking === 0)}>{t('sqSmokingNo')}</button>
          <button onClick={() => onChange('smoking', 1)} style={pill(demo.smoking === 1)}>{t('sqSmokingYes')}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function SymptomsModal({ open, onClose, onSubmit, t }) {
  const [demoPhase, setDemoPhase] = useState(true)
  const [demo, setDemo]           = useState(DEFAULT_DEMO)
  const [answers, setAnswers]     = useState({})
  const [step, setStep]           = useState(0)

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setDemoPhase(true)
      setDemo(DEFAULT_DEMO)
      setAnswers({})
      setStep(0)
    }
  }, [open])

  // Rose questions logic
  const activeQs      = Q_DEFS.filter(q => !q.showIf || q.showIf(answers))
  const safeStep      = Math.min(step, Math.max(0, activeQs.length - 1))
  const currentQ      = activeQs[safeStep]
  const optimisticTotal = answers.sq1 !== undefined ? activeQs.length : Q_DEFS.length
  const isRoseLast    = answers.sq1 !== undefined && safeStep === activeQs.length - 1

  // Progress: demo phase = 0–50%, rose phase = 50–100%
  const progress = demoPhase
    ? 10
    : 50 + (optimisticTotal > 0 ? ((safeStep + 1) / optimisticTotal) * 50 : 0)

  const canAdvance = () => {
    if (!currentQ) return false
    const ans = answers[currentQ.id]
    return currentQ.type === 'multi' ? (ans || []).length > 0 : ans !== undefined
  }

  const handleDemoChange = (key, val) => setDemo(prev => ({ ...prev, [key]: val }))

  const handleSingle = (idx) => setAnswers(prev => ({ ...prev, [currentQ.id]: idx }))

  const handleMulti = (idx) => {
    setAnswers(prev => {
      const cur = prev[currentQ.id] || []
      const newVal = cur.includes(idx) ? cur.filter(i => i !== idx) : [...cur, idx]
      return { ...prev, [currentQ.id]: newVal }
    })
  }

  const handleNext = () => {
    if (isRoseLast) {
      onSubmit({
        readable:     buildReadableSymptoms(answers, t),
        demographics: demo,
        roseFlag:     computeRoseFlag(answers),
      })
      onClose()
    } else {
      setStep(safeStep + 1)
    }
  }

  const handleBack = () => {
    if (safeStep === 0) setDemoPhase(true)
    else setStep(s => s - 1)
  }

  const handleSkip = () => {
    onSubmit({ readable: [], demographics: demo, roseFlag: 0 })
    onClose()
  }

  if (!open) return null

  const sheetStyle = isMobile ? {
    position: 'fixed', bottom: 0, left: 0, right: 0,
    zIndex: 1100,
    borderRadius: '24px 24px 0 0',
    maxHeight: '92vh',
    overflowY: 'auto',
    background: 'var(--c-card)',
    border: '1px solid var(--c-border)',
    borderBottom: 'none',
    animation: 'sqSlideUp 0.35s cubic-bezier(0.32, 0.72, 0, 1) both',
    paddingBottom: 'env(safe-area-inset-bottom, 16px)',
  } : {
    position: 'fixed',
    bottom: '32px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1100,
    width: '460px',
    maxWidth: 'calc(100vw - 32px)',
    borderRadius: '20px',
    background: 'var(--c-card)',
    border: '1px solid var(--c-border)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
    animation: 'sqSlideUpCard 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleSkip}
        style={{
          position: 'fixed', inset: 0, zIndex: 1099,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

      <div style={sheetStyle}>
        {/* Handle bar (mobile) */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'var(--c-border)' }} />
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Heart size={15} color="#ef4444" />
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-text)' }}>
                {t('sqTitle')}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--c-dim)', marginLeft: '8px' }}>
                {demoPhase ? t('sqPhaseDemo') : t('sqPhaseRose')}
              </span>
            </div>
          </div>
          <button
            onClick={handleSkip}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-dim)', padding: '4px', display: 'flex' }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ margin: '0 18px', height: '2px', background: 'var(--c-border)', borderRadius: '1px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: '#ef4444', borderRadius: '1px',
            width: `${progress}%`, transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Phase label */}
        <div style={{ padding: '12px 18px 0' }}>
          {demoPhase ? (
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--c-text)' }}>{t('sqDemoTitle')}</p>
          ) : (
            <>
              <p style={{ fontSize: '11px', color: 'var(--c-dim)', marginBottom: '6px', letterSpacing: '0.05em' }}>
                {safeStep + 1} / {optimisticTotal}
              </p>
              <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--c-text)', lineHeight: 1.55, marginBottom: '14px' }}>
                {t(currentQ?.id)}
              </p>
            </>
          )}
        </div>

        {/* Content */}
        {demoPhase ? (
          <DemographicsStep demo={demo} onChange={handleDemoChange} t={t} />
        ) : (
          /* Rose options */
          <div style={{ padding: '0 18px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {currentQ && Array.from({ length: currentQ.optCount }, (_, i) => {
                const selected = currentQ.type === 'multi'
                  ? (answers[currentQ.id] || []).includes(i)
                  : answers[currentQ.id] === i
                return (
                  <button
                    key={i}
                    onClick={() => currentQ.type === 'multi' ? handleMulti(i) : handleSingle(i)}
                    style={{
                      textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '11px 14px', borderRadius: '12px', cursor: 'pointer',
                      border: `1px solid ${selected ? 'rgba(239,68,68,0.5)' : 'var(--c-border)'}`,
                      background: selected ? 'rgba(239,68,68,0.08)' : 'transparent',
                      color: selected ? '#f87171' : 'var(--c-muted)',
                      fontSize: '14px', transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{
                      width: '17px', height: '17px', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: currentQ.type === 'multi' ? '4px' : '50%',
                      border: `1.5px solid ${selected ? '#ef4444' : 'var(--c-border)'}`,
                      background: selected ? '#ef4444' : 'transparent',
                      transition: 'all 0.15s ease',
                    }}>
                      {selected && <Check size={9} color="white" strokeWidth={3} />}
                    </span>
                    {t(`${currentQ.id}opt${i + 1}`)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ padding: '16px 18px 20px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {demoPhase ? (
            <button
              onClick={handleSkip}
              style={{
                padding: '10px 12px', borderRadius: '10px',
                border: '1px solid var(--c-border)',
                color: 'var(--c-dim)', background: 'transparent',
                cursor: 'pointer', fontSize: '12px', flexShrink: 0, whiteSpace: 'nowrap',
              }}
            >
              {t('sqSkip')}
            </button>
          ) : (
            <button
              onClick={handleBack}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '10px 12px', borderRadius: '10px',
                border: '1px solid var(--c-border)',
                color: 'var(--c-muted)', background: 'transparent',
                cursor: 'pointer', fontSize: '13px', flexShrink: 0,
              }}
            >
              <ChevronLeft size={13} />
            </button>
          )}

          <button
            onClick={demoPhase ? () => setDemoPhase(false) : handleNext}
            disabled={!demoPhase && !canAdvance()}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '10px 16px', borderRadius: '10px',
              background: (demoPhase || canAdvance()) ? 'var(--c-accent)' : 'var(--c-border)',
              color: (demoPhase || canAdvance()) ? 'var(--c-accent-fg)' : 'var(--c-dim)',
              border: 'none', cursor: (demoPhase || canAdvance()) ? 'pointer' : 'default',
              fontSize: '13px', fontWeight: 500, transition: 'all 0.15s ease',
            }}
          >
            {!demoPhase && isRoseLast
              ? <><Check size={13} /> {t('sqDone')}</>
              : <>{t('sqNext')} <ChevronRight size={13} /></>
            }
          </button>
        </div>
      </div>
    </>
  )
}
