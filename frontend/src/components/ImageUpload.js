import { useState, useRef } from 'react'
import { UploadCloud, Link as LinkIcon, ImageIcon, Code2 } from 'lucide-react'
import { useLanguage } from '../LanguageContext'

const ROBOFLOW_URL = 'https://detect.roboflow.com'

const invoke = window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)

async function roboflowPost(url, body, format) {
  if (invoke && isIOS) {
    // Native path — bypasses WKWebView fetch restrictions (iOS only)
    const result = await invoke('roboflow_infer', { url, body })
    return result
  }
  // Web path — works on Android WebView and browser
  const res = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } })
  if (format === 'image') {
    const blob = await res.blob()
    const dataUrl = await new Promise((resolve) => {
      const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob)
    })
    return { type: 'image', data: dataUrl }
  }
  return { type: 'json', data: await res.json() }
}


const card = { border: '1px solid var(--c-border)', background: 'var(--c-card)', borderRadius: '16px' }
const inputSt = { background: 'transparent', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text)' }

export default function ImageUpload({ apiKey, model, version }) {
  const { t } = useLanguage()
  const [method, setMethod]     = useState('upload')
  const [format, setFormat]     = useState('image')
  const [file, setFile]         = useState(null)
  const [url, setUrl]           = useState('')
  const [confidence, setConf]   = useState(20)
  const [overlap, setOverlap]   = useState(30)
  const [labels, setLabels]     = useState(true)
  const [stroke, setStroke]     = useState(2)
  const [result, setResult]     = useState(null)
  const [loading, setLoading]   = useState(false)
  const [errorKey, setErrorKey] = useState(null)
  const [errorDetail, setErrorDetail] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  const handleFileChange = (e) => { const f = e.target.files[0]; if (f) { setFile(f); setErrorKey(null) } }
  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]; if (f) { setFile(f); setErrorKey(null) }
  }

  const buildUrl = (extra = '', fmt = format) => {
    let u = `${ROBOFLOW_URL}/${model}/${version}?api_key=${apiKey}`
    u += `&confidence=${confidence}&overlap=${overlap}&format=${fmt}`
    if (fmt === 'image') { if (labels) u += '&labels=on'; u += `&stroke=${stroke}` }
    if (extra) u += extra
    return u
  }

  const runInference = async (e) => {
    e.preventDefault(); setErrorKey(null); setErrorDetail(null); setResult(null); setLoading(true)
    try {
      let body = ''
      let extra = ''
      if (method === 'upload') {
        if (!file) { setErrorKey('errorSelectFile'); setLoading(false); return }
        body = await new Promise((resolve) => {
          const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file)
        })
      } else {
        if (!url) { setErrorKey('errorEnterUrl'); setLoading(false); return }
        extra = `&image=${encodeURIComponent(url)}`
      }

      if (format === 'image') {
        // Run image + JSON in parallel so we can show prediction count
        const [imgResult, jsonResult] = await Promise.all([
          roboflowPost(buildUrl(extra, 'image'), body, 'image'),
          roboflowPost(buildUrl(extra, 'json'), body, 'json'),
        ])
        const count = jsonResult?.data?.predictions?.length ?? null
        setResult({ ...imgResult, count })
      } else {
        const result = await roboflowPost(buildUrl(extra, 'json'), body, 'json')
        const count = result?.data?.predictions?.length ?? null
        setResult({ ...result, count })
      }
      setLoading(false)
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

      {/* Result */}
      {result && (
        <div className="border rounded-2xl overflow-hidden animate-fade-in" style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--c-dim)' }}>{t('result')}</p>
          </div>
          <div className="p-4 space-y-3">
            {result.type === 'image' ? (
              <img src={result.data} alt="Inference result" className="w-full rounded-xl" />
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
          </div>
        </div>
      )}
    </div>
  )
}
