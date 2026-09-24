import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Check, Heart } from 'lucide-react'
import { EMPTY_DEMOGRAPHICS } from '../services/patientData'

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

const DEFAULT_DEMO = EMPTY_DEMOGRAPHICS

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
  const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--c-border)', background: 'var(--c-card)', color: 'var(--c-text)' }
  const numeric = [
    ['age', 'sqAge', 'sqAgeUnit', 18, 100, 1],
    ['sbp', 'sqSbp', 'sqSbpUnit', 50, 300, 1],
    ['cholesterol', 'sqCholesterol', 'sqCholUnit', 0.1, 30, 0.1],
  ]
  return (
    <div style={{ padding: '6px 18px 4px' }}>
      <p className="text-xs mb-3" style={{ color: 'var(--c-dim)' }}>{t('sqDataHelp')}</p>
      {numeric.map(([key, label, unit, min, max, step]) => (
        <div key={key} className="mb-3">
          <label htmlFor={'patient-' + key} className="text-xs block mb-1">{t(label)} ({t(unit)})</label>
          <input id={'patient-' + key} type="number" min={min} max={max} step={step}
            value={demo[key] ?? ''} placeholder={t('sqUnknown')} style={inputStyle}
            onChange={e => onChange(key, e.target.value === '' ? null : Number(e.target.value))}
            onBlur={e => { if (!e.target.validity.valid) onChange(key, null) }} />
          <button type="button" onClick={() => onChange(key, null)} className="text-xs mt-1 underline" style={{ color: 'var(--c-dim)' }}>{t('sqUnknown')}</button>
        </div>
      ))}
      {[
        ['sex', 'sqSex', 'sqSexF', 'sqSexM'],
        ['smoking', 'sqSmoking', 'sqSmokingNo', 'sqSmokingYes'],
      ].map(([key, label, no, yes]) => (
        <div key={key} className="mb-3">
          <label htmlFor={'patient-' + key} className="text-xs block mb-1">{t(label)}</label>
          <select id={'patient-' + key} value={demo[key] ?? ''} style={inputStyle}
            onChange={e => onChange(key, e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">{t('sqUnknown')}</option>
            <option value="0">{t(no)}</option><option value="1">{t(yes)}</option>
          </select>
        </div>
      ))}
    </div>
  )
}

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
    onSubmit({ readable: buildReadableSymptoms(answers, t), demographics: demo, roseFlag: null })
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
    maxHeight: '90vh',
    overflowY: 'auto',
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
