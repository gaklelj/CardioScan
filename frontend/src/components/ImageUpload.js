import { useState, useRef, useEffect } from 'react'
import { UploadCloud, Link as LinkIcon, ImageIcon, Code2, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { useLanguage } from '../LanguageContext'
import SymptomsModal, { SymptomsCard } from './SymptomsModal'
import RiskAssessmentCard from './RiskAssessmentCard'

const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke

// Resize image to max 1280px before sending — large photos (5-15MB) exceed
// Android Tauri IPC limit and cause silent failures
async function resizeToDataUrl(file, maxSide = 1280) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

async function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob)
  })
}


// Assign a stable color to any class name
const PALETTE = ['#ef4444','#f97316','#f59e0b','#22c55e','#60a5fa','#a78bfa','#ec4899','#14b8a6']
function classColor(cls) {
  const c = (cls || '').toUpperCase()
  if (c.includes('NORMAL'))                       return '#22c55e'
  if (c.includes('ST-E') || c.includes('STE'))    return '#ef4444'
  if (c.includes('ST-D') || c.includes('STD'))    return '#f59e0b'
  if (c.includes('ST'))                           return '#f97316'
  if (c.includes('AF') || c.includes('FIBR'))     return '#f97316'
  if (c.startsWith('T'))                          return '#f59e0b'
  if (c.startsWith('P'))                          return '#60a5fa'
  if (c.includes('QRS') || c.startsWith('Q'))     return '#a78bfa'
  if (c.includes('NOISE'))                        return '#6b7280'
  let h = 0; for (const ch of cls) h = (h * 31 + ch.charCodeAt(0)) & 0xFFFF
  return PALETTE[h % PALETTE.length]
}

// Group predictions by class → { class, count, avgConf, maxConf }
function groupPredictions(predictions) {
  const map = {}
  for (const p of predictions) {
    if (!map[p.class]) map[p.class] = { cls: p.class, count: 0, total: 0, max: 0 }
    map[p.class].count++
    map[p.class].total += p.confidence
    map[p.class].max = Math.max(map[p.class].max, p.confidence)
  }
  return Object.values(map)
    .map(g => ({ ...g, avg: g.total / g.count }))
    .sort((a, b) => b.max - a.max)
}

const BACKEND = 'https://foodtrack.beast-inside.kz/cardio'

function ImageModal({ src, predictions, onClose, t, lang }) {
  const [scale, setScale] = useState(1)
  const [g4fSummary, setG4fSummary] = useState(null)
  const [g4fLoading, setG4fLoading] = useState(false)
  const [g4fError, setG4fError] = useState(null)
  const touch = useRef({ dist: 0, scale: 1 })

  // iOS-compatible scroll lock: position:fixed approach
  useEffect(() => {
    const scrollY = window.scrollY
    const body = document.body
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  useEffect(() => {
    if (predictions.length === 0) return
    setG4fLoading(true)
    fetch(`${BACKEND}/api/ecg/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predictions, lang }),
    })
      .then(r => r.json())
      .then(data => { if (data.summary) setG4fSummary(data.summary); else setG4fError(true) })
      .catch(() => setG4fError(true))
      .finally(() => setG4fLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (s) => Math.min(5, Math.max(0.5, s))
  const groups = groupPredictions(predictions)

  const onWheel = (e) => { e.preventDefault(); setScale(s => clamp(s * (e.deltaY > 0 ? 0.9 : 1.1))) }
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      touch.current.dist  = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
      touch.current.scale = scale
    }
  }
  const onTouchMove = (e) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
      setScale(clamp(touch.current.scale * dist / touch.current.dist))
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0a0a0a', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        paddingBottom: '10px', paddingLeft: '16px', paddingRight: '12px',
        background: 'rgba(10,10,10,0.96)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(16px)',
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#fff', margin: 0, lineHeight: 1.3 }}>{t('reportTitle')}</p>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)', margin: 0, marginTop: '2px' }}>
            {predictions.length > 0
              ? `${predictions.length} ${t('detectedN').toLowerCase()} · ${groups.length} ${t('reportClasses')}`
              : t('noneDetected')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0, marginLeft: '8px' }}>
          <button onClick={() => setScale(s => clamp(s * 1.3))} style={{ color: 'rgba(255,255,255,0.45)', cursor: 'pointer', padding: '8px', borderRadius: '8px', background: 'transparent', border: 'none' }}><ZoomIn size={17} /></button>
          <button onClick={() => setScale(s => clamp(s * 0.75))} style={{ color: 'rgba(255,255,255,0.45)', cursor: 'pointer', padding: '8px', borderRadius: '8px', background: 'transparent', border: 'none' }}><ZoomOut size={17} /></button>
          <button onClick={() => setScale(1)} style={{ color: 'rgba(255,255,255,0.45)', cursor: 'pointer', padding: '8px', borderRadius: '8px', background: 'transparent', border: 'none' }}><RotateCcw size={15} /></button>
          <button onClick={onClose} style={{ color: '#fff', cursor: 'pointer', padding: '8px', borderRadius: '10px', background: 'rgba(255,255,255,0.1)', border: 'none', marginLeft: '4px', display: 'flex', alignItems: 'center' }}>
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Single unified scroll — image + findings + summary all in one flow */}
      <div
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        {/* Image */}
        <div style={{ background: '#060606', padding: '12px 12px 0' }}>
          <img
            src={src}
            alt="ECG result"
            draggable={false}
            style={{ width: `calc(100% * ${scale})`, display: 'block', borderRadius: '10px', userSelect: 'none' }}
          />
        </div>

        {/* Findings + summary */}
        <div style={{
          padding: '16px 16px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
          background: '#0a0a0a',
        }}>
          {groups.length === 0 ? (
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '20px 0', margin: 0 }}>{t('noneDetected')}</p>
          ) : (
            <>
              <p style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px', marginTop: 0 }}>
                {t('reportFindings')}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
                {groups.map((g) => {
                  const color = classColor(g.cls)
                  return (
                    <div key={g.cls} style={{
                      borderRadius: '12px', padding: '12px',
                      background: `${color}12`, border: `1px solid ${color}35`,
                      display: 'flex', flexDirection: 'column', gap: '7px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color, lineHeight: 1.25, flex: 1 }}>{g.cls}</span>
                        {g.count > 1 && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color, background: `${color}22`, borderRadius: '20px', padding: '2px 7px', flexShrink: 0 }}>×{g.count}</span>
                        )}
                      </div>
                      <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(g.max * 100).toFixed(0)}%`, background: color, borderRadius: '2px' }} />
                      </div>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', color: `${color}aa` }}>max {(g.max * 100).toFixed(1)}%</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* G4F Summary */}
          {(g4fLoading || g4fSummary || g4fError) && (
            <div style={{ borderRadius: '12px', border: '1px solid rgba(34,197,94,0.18)', background: 'rgba(34,197,94,0.04)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 12px', borderBottom: '1px solid rgba(34,197,94,0.1)', background: 'rgba(34,197,94,0.06)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="rgba(34,197,94,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(34,197,94,0.85)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {t('g4fSummaryTitle')}
                </span>
                {g4fLoading && (
                  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" stroke="rgba(34,197,94,0.2)" strokeWidth="3"/>
                    <path d="M4 12a8 8 0 018-8" stroke="rgba(34,197,94,0.75)" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                )}
              </div>
              <div style={{ padding: '11px 12px' }}>
                {g4fLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[90, 70, 55].map((w, i) => (
                      <div key={i} style={{ height: '9px', borderRadius: '5px', width: `${w}%`, background: 'linear-gradient(90deg, rgba(34,197,94,0.08) 25%, rgba(34,197,94,0.2) 50%, rgba(34,197,94,0.08) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.6s infinite' }} />
                    ))}
                  </div>
                )}
                {g4fSummary && <p style={{ fontSize: '13px', lineHeight: '1.65', color: 'rgba(255,255,255,0.78)', margin: 0, whiteSpace: 'pre-wrap' }}>{g4fSummary}</p>}
                {g4fError && <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: 0 }}>{t('g4fSummaryError')}</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const card = { border: '1px solid var(--c-border)', background: 'var(--c-card)', borderRadius: '16px' }
const inputSt = { background: 'transparent', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text)' }

export default function ImageUpload({ anthropicKey }) {
  const { t, lang } = useLanguage()
  const [method, setMethod]     = useState('upload')
  const [format, setFormat]     = useState('image')
  const [file, setFile]         = useState(null)
  const [url, setUrl]           = useState('')
  const [confidence, setConf]   = useState(20)
  const [overlap, setOverlap]   = useState(30)
  const [labels, setLabels]     = useState(true)
  const [stroke, setStroke]     = useState(2)
  const [result, setResult]     = useState(null)
  const [modal, setModal]       = useState(false)
  const [loading, setLoading]   = useState(false)
  const [errorKey, setErrorKey] = useState(null)
  const [errorDetail, setErrorDetail] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [aiReport, setAiReport]           = useState(null)
  const [aiReportLoading, setAiReportLoading] = useState(false)
  const [aiReportError, setAiReportError]   = useState(null)
  const [g4fSummary, setG4fSummary] = useState(null)
  const [g4fLoading, setG4fLoading] = useState(false)
  const [g4fError, setG4fError]     = useState(null)
  const [hoverImg, setHoverImg]     = useState(false)
  const [showSymptoms, setShowSymptoms] = useState(false)
  const [symptoms, setSymptoms]         = useState(null)
  const [riskData, setRiskData]         = useState(null)
  const [riskLoading, setRiskLoading]   = useState(false)
  const fileRef = useRef(null)

  // Fetch risk assessment when both symptoms + predictions are available
  useEffect(() => {
    if (!symptoms?.demographics || !result?.predictions?.length) return
    setRiskLoading(true)
    // Build ECG probabilities from YOLO predictions (class → max confidence)
    const ecg = {}
    for (const p of result.predictions) {
      const cls = p.class
      if (!ecg[cls] || p.confidence > ecg[cls]) ecg[cls] = p.confidence
    }
    fetch(`${BACKEND}/api/risk-assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ecg_probabilities: ecg,
        demographics: symptoms.demographics,
        rose_flag: symptoms.roseFlag ?? 0,
      }),
    })
      .then(r => r.json())
      .then(data => { if (data.risk_class) setRiskData(data); else setRiskLoading(false) })
      .catch(() => setRiskLoading(false))
      .finally(() => setRiskLoading(false))
  }, [symptoms, result]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = (e) => { const f = e.target.files[0]; if (f) { setFile(f); setErrorKey(null) } }
  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]; if (f) { setFile(f); setErrorKey(null) }
  }

  const fetchAiReport = async (preds) => {
    if (!invoke || !anthropicKey || anthropicKey === 'YOUR_ANTHROPIC_API_KEY_HERE') return
    setAiReportLoading(true); setAiReport(null); setAiReportError(null)
    try {
      const text = await invoke('ai_report', { predictions: preds, lang, apiKey: anthropicKey })
      setAiReport(text)
    } catch (err) {
      setAiReportError(String(err?.message || err))
    } finally {
      setAiReportLoading(false)
    }
  }

  const runInference = async (e) => {
    e.preventDefault()
    setErrorKey(null); setErrorDetail(null); setResult(null); setLoading(true)
    setAiReport(null); setAiReportLoading(false); setAiReportError(null)
    setG4fSummary(null); setG4fLoading(false); setG4fError(null)
    setSymptoms(null); setShowSymptoms(true)
    try {
      let base64data = ''
      if (method === 'upload') {
        if (!file) { setErrorKey('errorSelectFile'); setLoading(false); return }
        const dataUrl = await resizeToDataUrl(file)
        base64data = dataUrl.split(',')[1]
      } else {
        if (!url) { setErrorKey('errorEnterUrl'); setLoading(false); return }
        const resp = await fetch(url)
        base64data = (await blobToDataUrl(await resp.blob())).split(',')[1]
      }

      const params = `confidence=${confidence}&overlap=${overlap}&labels=${labels ? 'on' : 'off'}`
      const body = JSON.stringify({ image: base64data })
      const headers = { 'Content-Type': 'application/json' }

      // Always fetch JSON predictions
      const jsonResp = await fetch(`${BACKEND}/api/ecg/analyze?format=json&${params}`, { method: 'POST', headers, body })
      if (!jsonResp.ok) throw new Error(`Server error ${jsonResp.status}`)
      const jsonData = await jsonResp.json()
      const preds = jsonData.predictions ?? []

      if (format === 'image') {
        const imgResp = await fetch(`${BACKEND}/api/ecg/analyze?format=image&${params}`, { method: 'POST', headers, body })
        const imgDataUrl = await blobToDataUrl(await imgResp.blob())
        setResult({ type: 'image', data: imgDataUrl, count: preds.length, predictions: preds })
      } else {
        setResult({ type: 'json', data: jsonData, count: preds.length, predictions: preds })
      }

      setLoading(false)
      fetchAiReport(preds)
      if (preds.length > 0) {
        setG4fLoading(true)
        fetch(`${BACKEND}/api/ecg/summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ predictions: preds, lang }),
        })
          .then(r => r.json())
          .then(data => { if (data.summary) setG4fSummary(data.summary); else setG4fError(true) })
          .catch(() => setG4fError(true))
          .finally(() => setG4fLoading(false))
      }
    } catch (err) {
      setErrorKey('errorInference')
      setErrorDetail(String(err?.message || err))
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">

      {/* Source card */}
      <div style={card}>
        {/* Method tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--c-border)' }}>
          {[{ v: 'upload', label: t('tabFile'), Icon: UploadCloud }, { v: 'url', label: t('tabUrl'), Icon: LinkIcon }].map(({ v, label, Icon }) => (
            <button
              key={v}
              onClick={() => setMethod(v)}
              className="flex items-center gap-2 px-4 sm:px-5 py-3 text-xs font-medium transition-colors cursor-pointer border-r last:border-0"
              style={{
                borderColor: 'var(--c-border)',
                color: method === v ? 'var(--c-text)' : 'var(--c-dim)',
                background: method === v ? 'var(--c-hover)' : 'transparent',
              }}
            >
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {method === 'upload' ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileRef.current.click()}
              className="border border-dashed rounded-xl p-6 sm:p-8 text-center cursor-pointer transition-colors"
              style={{
                borderColor: dragging ? 'var(--c-muted)' : 'var(--c-border)',
                background: dragging ? 'var(--c-hover)' : 'transparent',
              }}
            >
              <UploadCloud size={18} className="mx-auto mb-3" style={{ color: 'var(--c-dim)' }} />
              {file ? (
                <p className="text-sm font-medium break-all" style={{ color: 'var(--c-text)' }}>{file.name}</p>
              ) : (
                <>
                  <p className="text-sm" style={{ color: 'var(--c-muted)' }}>{t('dropHere')}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--c-dim)' }}>{t('dropHint')}</p>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </div>
          ) : (
            <input
              type="text" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/ecg.jpg"
              className="w-full px-4 py-3 text-sm outline-none transition-colors"
              style={inputSt}
            />
          )}
        </div>
      </div>

      {/* Settings card */}
      <div className="p-4 space-y-4" style={card}>
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--c-dim)' }}>{t('parameters')}</p>

        {/* Format toggle */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs shrink-0" style={{ color: 'var(--c-muted)' }}>{t('outputFormat')}</span>
          <div className="flex border rounded-lg overflow-hidden shrink-0" style={{ borderColor: 'var(--c-border)' }}>
            {[{ v: 'image', Icon: ImageIcon, label: t('imgLabel') }, { v: 'json', Icon: Code2, label: 'JSON' }].map(({ v, Icon, label }) => (
              <button
                key={v} onClick={() => setFormat(v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border-r last:border-0"
                style={{
                  borderColor: 'var(--c-border)',
                  background: format === v ? 'var(--c-hover)' : 'transparent',
                  color: format === v ? 'var(--c-text)' : 'var(--c-dim)',
                }}
              >
                <Icon size={11} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-2 gap-4">
          {[{ label: t('confidence'), value: confidence, set: setConf }, { label: t('overlap'), value: overlap, set: setOverlap }].map(({ label, value, set }) => (
            <div key={label} className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-xs truncate pr-1" style={{ color: 'var(--c-dim)' }}>{label}</span>
                <span className="text-xs font-mono shrink-0" style={{ color: 'var(--c-dim)' }}>{value}%</span>
              </div>
              <input
                type="range" min="0" max="100" value={value}
                onChange={(e) => set(Number(e.target.value))}
                className="w-full cursor-pointer h-0.5"
                style={{ accentColor: 'var(--c-accent)' }}
              />
            </div>
          ))}
        </div>

        {/* Image-only options */}
        {format === 'image' && (
          <div className="flex items-center justify-between gap-3 pt-2 border-t flex-wrap" style={{ borderColor: 'var(--c-border)' }}>
            <div className="flex items-center gap-2.5">
              <span className="text-xs" style={{ color: 'var(--c-dim)' }}>{t('labels')}</span>
              <button
                onClick={() => setLabels(!labels)}
                className="w-8 h-4 rounded-full transition-colors cursor-pointer relative shrink-0"
                style={{ background: labels ? 'var(--c-accent)' : 'var(--c-border)' }}
              >
                <span
                  className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                  style={{
                    background: labels ? 'var(--c-accent-fg)' : 'var(--c-muted)',
                    left: labels ? '17px' : '2px',
                  }}
                />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--c-dim)' }}>{t('stroke')}</span>
              <div className="flex gap-1">
                {[1, 2, 5].map((s) => (
                  <button
                    key={s} onClick={() => setStroke(s)}
                    className="px-2 py-0.5 rounded text-xs cursor-pointer transition-all font-mono"
                    style={{
                      background: stroke === s ? 'var(--c-hover)' : 'transparent',
                      color: stroke === s ? 'var(--c-text)' : 'var(--c-dim)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Run button */}
      <button
        onClick={runInference} disabled={loading}
        className="w-full py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'var(--c-accent)', color: 'var(--c-accent-fg)' }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            {t('analyzing')}
          </span>
        ) : t('runInference')}
      </button>

      {/* Error */}
      {errorKey && (
        <div className="border rounded-xl px-4 py-3 text-sm space-y-1" style={{ borderColor: 'var(--c-warn-border)', background: 'var(--c-warn-bg)', color: 'var(--c-warn-text)' }}>
          <div>{t(errorKey)}</div>
          {errorDetail && <div className="text-xs opacity-70 font-mono break-all">{errorDetail}</div>}
        </div>
      )}

      {/* Симптомы пациента */}
      {symptoms?.readable?.length > 0 && (
        <SymptomsCard symptoms={symptoms.readable} t={t} />
      )}

      {/* Оценка кардиологического риска */}
      <RiskAssessmentCard riskData={riskData} loading={riskLoading} t={t} />

      {/* Result */}
      {result && (
        <div className="border rounded-2xl overflow-hidden animate-fade-in" style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--c-dim)' }}>{t('result')}</p>
          </div>
          <div className="p-4 space-y-3">
            {result.type === 'image' ? (
              <div
                style={{ position: 'relative', cursor: 'zoom-in', borderRadius: '12px', overflow: 'hidden' }}
                onClick={() => setModal(true)}
                onMouseEnter={() => setHoverImg(true)}
                onMouseLeave={() => setHoverImg(false)}
              >
                <img src={result.data} alt="Inference result" className="w-full" style={{ display: 'block', pointerEvents: 'none' }} />
                {/* Hover overlay */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: hoverImg ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0)',
                  transition: 'background 0.18s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    background: 'rgba(255,255,255,0.18)', borderRadius: '50%', padding: '12px',
                    opacity: hoverImg ? 1 : 0, transform: hoverImg ? 'scale(1)' : 'scale(0.75)',
                    transition: 'opacity 0.18s, transform 0.18s',
                  }}>
                    <ZoomIn size={26} color="white" />
                  </div>
                </div>
                {/* Always-visible mobile hint badge */}
                <div style={{
                  position: 'absolute', bottom: 10, right: 10,
                  background: 'rgba(0,0,0,0.52)', borderRadius: '8px', padding: '5px 8px',
                  display: 'flex', alignItems: 'center', gap: '5px',
                  backdropFilter: 'blur(6px)', pointerEvents: 'none',
                  opacity: hoverImg ? 0 : 0.82, transition: 'opacity 0.18s',
                }}>
                  <ZoomIn size={12} color="white" />
                  <span style={{ fontSize: '10px', color: 'white', fontWeight: 500 }}>{t('tapToZoom')}</span>
                </div>
              </div>
            ) : (
              <pre className="text-xs overflow-auto max-h-80 font-mono leading-relaxed" style={{ color: 'var(--c-muted)' }}>
                {JSON.stringify(result.data, null, 2)}
              </pre>
            )}
            {result.count !== null && (
              <div
                className="text-sm px-3 py-2 rounded-lg text-center font-medium"
                style={{
                  background: result.count > 0 ? 'var(--c-warn-bg)' : 'var(--c-hover)',
                  color: result.count > 0 ? 'var(--c-warn-text)' : 'var(--c-muted)',
                  border: `1px solid ${result.count > 0 ? 'var(--c-warn-border)' : 'var(--c-border)'}`,
                }}
              >
                {result.count > 0
                  ? `${t('detectedN')} ${result.count}`
                  : t('noneDetected')}
              </div>
            )}

            {/* Findings chips */}
            {result.predictions && result.predictions.length > 0 && (() => {
              const groups = groupPredictions(result.predictions)
              return (
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--c-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
                    {t('reportFindings')}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '7px' }}>
                    {groups.map((g) => {
                      const color = classColor(g.cls)
                      return (
                        <div key={g.cls} style={{
                          borderRadius: '10px', padding: '9px 10px',
                          background: `${color}12`, border: `1px solid ${color}35`,
                          display: 'flex', flexDirection: 'column', gap: '5px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color, lineHeight: 1.2, flex: 1 }}>{g.cls}</span>
                            {g.count > 1 && (
                              <span style={{ fontSize: '10px', fontWeight: 700, color, background: `${color}22`, borderRadius: '20px', padding: '1px 5px', flexShrink: 0 }}>×{g.count}</span>
                            )}
                          </div>
                          <div style={{ height: '3px', borderRadius: '2px', background: 'var(--c-border)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(g.max * 100).toFixed(0)}%`, background: color, borderRadius: '2px' }} />
                          </div>
                          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: `${color}bb` }}>max {(g.max * 100).toFixed(1)}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* G4F Summary on main page */}
            {(g4fLoading || g4fSummary || g4fError) && (
              <div style={{ borderRadius: '12px', border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.04)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px', borderBottom: '1px solid rgba(34,197,94,0.1)', background: 'rgba(34,197,94,0.06)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="rgba(34,197,94,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(34,197,94,0.9)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {t('g4fSummaryTitle')}
                  </span>
                  {g4fLoading && (
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" stroke="rgba(34,197,94,0.25)" strokeWidth="3"/>
                      <path d="M4 12a8 8 0 018-8" stroke="rgba(34,197,94,0.8)" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                  )}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  {g4fLoading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {[90, 70, 55].map((w, i) => (
                        <div key={i} style={{ height: '9px', borderRadius: '5px', width: `${w}%`, background: 'linear-gradient(90deg, rgba(34,197,94,0.1) 25%, rgba(34,197,94,0.22) 50%, rgba(34,197,94,0.1) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.6s infinite' }} />
                      ))}
                    </div>
                  )}
                  {g4fSummary && <p style={{ fontSize: '12px', lineHeight: '1.65', color: 'var(--c-muted)', margin: 0, whiteSpace: 'pre-wrap' }}>{g4fSummary}</p>}
                  {g4fError && <p style={{ fontSize: '12px', color: 'var(--c-dim)', margin: 0 }}>{t('g4fSummaryError')}</p>}
                </div>
              </div>
            )}

            {/* AI Report */}
            {(aiReportLoading || aiReport || aiReportError) && (
              <div style={{
                borderRadius: '14px',
                border: '1px solid rgba(139,92,246,0.25)',
                background: 'linear-gradient(135deg, rgba(139,92,246,0.06) 0%, rgba(59,130,246,0.06) 100%)',
                overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 14px',
                  borderBottom: '1px solid rgba(139,92,246,0.15)',
                  background: 'rgba(139,92,246,0.07)',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="rgba(139,92,246,0.9)" strokeWidth="2" strokeLinejoin="round"/>
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="rgba(139,92,246,0.9)" strokeWidth="2" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(139,92,246,0.9)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {t('aiReportTitle')}
                  </span>
                  {aiReportLoading && (
                    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" stroke="rgba(139,92,246,0.3)" strokeWidth="3"/>
                      <path d="M4 12a8 8 0 018-8" stroke="rgba(139,92,246,0.8)" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                  )}
                </div>

                {/* Body */}
                <div style={{ padding: '12px 14px' }}>
                  {aiReportLoading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                      {[85, 65, 75].map((w, i) => (
                        <div key={i} style={{
                          height: '10px', borderRadius: '5px',
                          width: `${w}%`,
                          background: 'linear-gradient(90deg, rgba(139,92,246,0.15) 25%, rgba(139,92,246,0.28) 50%, rgba(139,92,246,0.15) 75%)',
                          backgroundSize: '200% 100%',
                          animation: 'shimmer 1.6s infinite',
                        }} />
                      ))}
                    </div>
                  )}

                  {aiReport && (
                    <p style={{
                      fontSize: '13px', lineHeight: '1.7',
                      color: 'var(--c-text)', margin: 0,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {aiReport}
                    </p>
                  )}

                  {aiReportError && (
                    <p style={{ fontSize: '12px', color: 'var(--c-warn-text)', margin: 0 }}>
                      {t('aiReportError')}
                    </p>
                  )}

                  {aiReport && (
                    <p style={{
                      fontSize: '10px', marginTop: '10px', marginBottom: 0,
                      color: 'rgba(139,92,246,0.5)', fontStyle: 'italic',
                    }}>
                      {t('aiReportDisclaimer')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <SymptomsModal
        open={showSymptoms}
        onClose={() => setShowSymptoms(false)}
        onSubmit={(data) => {
          setSymptoms(data)
          if (data.demographics) setRiskLoading(true)
        }}
        t={t}
      />

      {modal && result?.type === 'image' && (
        <ImageModal
          src={result.data}
          predictions={result.predictions ?? []}
          onClose={() => setModal(false)}
          t={t}
          lang={lang}
        />
      )}
    </div>
  )
}
