import { useEffect, useState } from 'react'
import { Clock, Trash2, FileDown, Activity, Upload, Wifi, Usb, Bluetooth, AlertTriangle, X } from 'lucide-react'
import Nav from '../components/Nav'
import useHistoryStore from '../store/useHistoryStore'
import { generatePDF } from '../services/generatePDF'
import { useLanguage } from '../LanguageContext'

const RISK_COLORS = {
  'Низкий':     '#22c55e', 'Low':      '#22c55e',
  'Умеренный':  '#f59e0b', 'Moderate': '#f59e0b',
  'Высокий':    '#f97316', 'High':     '#f97316',
  'Критический':'#ef4444', 'Critical': '#ef4444',
  'Төмен':      '#22c55e', 'Орташа':   '#f59e0b',
  'Жоғары':     '#f97316', 'Критикалық':'#ef4444',
}

const CLASS_COLORS = {
  NORM: '#22c55e', NOISE: '#6b7280',
  STTC: '#f97316', MI: '#ef4444',
  HYP:  '#f59e0b', CD:  '#a78bfa',
}

function connIcon(mode) {
  if (mode === 'wifi') return <Wifi size={11} />
  if (mode === 'bt')   return <Bluetooth size={11} />
  return <Usb size={11} />
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtTime(s) {
  if (!s) return null
  const m = Math.floor(s / 60), sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function TopClass({ record }) {
  const mr = record.modelResult
  const preds = record.predictions
  if (mr) {
    const col = CLASS_COLORS[mr.class] ?? '#6b7280'
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${col}22`, color: col, border: `1px solid ${col}44` }}>
        {mr.class}
      </span>
    )
  }
  if (preds?.length) {
    const top = preds.reduce((a, b) => a.confidence > b.confidence ? a : b)
    const col = '#60a5fa'
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${col}22`, color: col, border: `1px solid ${col}44` }}>
        {top.class}
      </span>
    )
  }
  return null
}

function ExpandedRecord({ record, onClose, lang }) {
  const [pdfLoading, setPdfLoading] = useState(false)

  const handlePDF = async () => {
    setPdfLoading(true)
    try { await generatePDF(record, lang) } finally { setPdfLoading(false) }
  }

  const mr = record.modelResult

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0" style={{ borderColor: 'var(--c-border)', background: 'var(--c-bg)' }}>
          <div className="flex items-center gap-2">
            {record.type === 'live'
              ? <Activity size={15} style={{ color: '#22c55e' }} />
              : <Upload size={15} style={{ color: '#60a5fa' }} />}
            <span className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{fmtDate(record.timestamp)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePDF}
              disabled={pdfLoading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--c-accent)', color: 'var(--c-accent-fg)' }}
            >
              <FileDown size={12} />
              {pdfLoading ? '...' : 'PDF'}
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" style={{ border: '1px solid var(--c-border)', color: 'var(--c-dim)' }}>
              <X size={13} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* ECG Image */}
          {record.ecgImageBase64 && (
            <div>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--c-dim)' }}>ЭКГ-снимок</p>
              <img src={record.ecgImageBase64} alt="ECG" className="w-full rounded-xl" style={{ border: '1px solid var(--c-border)' }} />
            </div>
          )}

          {/* Live waveform mini-preview */}
          {record.type === 'live' && record.ecgPoints?.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--c-dim)' }}>Сигнал ЭКГ</p>
              <MiniWaveform points={record.ecgPoints} />
            </div>
          )}

          {/* Risk */}
          {record.riskData && (
            <div>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--c-dim)' }}>Кардиологический риск</p>
              <div className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{ background: `${RISK_COLORS[record.riskData.risk_class] ?? '#6b7280'}18`, border: `1px solid ${RISK_COLORS[record.riskData.risk_class] ?? '#6b7280'}44` }}>
                <span className="font-bold text-sm" style={{ color: RISK_COLORS[record.riskData.risk_class] }}>{record.riskData.risk_class}</span>
                <span className="text-sm font-mono" style={{ color: 'var(--c-muted)' }}>{record.riskData.mortality_10y?.toFixed(1)}%</span>
              </div>
              {record.riskData.recommendation && (
                <p className="text-xs mt-2" style={{ color: 'var(--c-dim)' }}>{record.riskData.recommendation}</p>
              )}
            </div>
          )}

          {/* Model result */}
          {mr && (
            <div>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--c-dim)' }}>Результат нейросети</p>
              <div className="rounded-xl px-4 py-3 mb-2"
                style={{ background: `${CLASS_COLORS[mr.class] ?? '#6b7280'}18`, border: `1px solid ${CLASS_COLORS[mr.class] ?? '#6b7280'}44` }}>
                <span className="font-bold text-sm" style={{ color: CLASS_COLORS[mr.class] ?? 'var(--c-text)' }}>{mr.class}</span>
                <span className="ml-2 text-xs font-mono" style={{ color: 'var(--c-dim)' }}>{(mr.confidence * 100).toFixed(1)}%</span>
              </div>
              {mr.all && (
                <div className="space-y-1.5">
                  {Object.entries(mr.all).sort(([,a],[,b]) => b-a).map(([cls, conf]) => (
                    <div key={cls} className="flex items-center gap-2">
                      <span className="text-xs w-14 shrink-0" style={{ color: 'var(--c-dim)' }}>{cls}</span>
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(conf*100).toFixed(1)}%`, background: CLASS_COLORS[cls] ?? '#6b7280' }} />
                      </div>
                      <span className="text-xs font-mono w-10 text-right" style={{ color: 'var(--c-dim)' }}>{(conf*100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* YOLO predictions */}
          {record.predictions?.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--c-dim)' }}>Обнаруженные паттерны ({record.predictions.length})</p>
              <div className="space-y-1.5">
                {groupPreds(record.predictions).map(g => (
                  <div key={g.cls} className="flex items-center gap-2">
                    <span className="text-xs w-24 shrink-0 truncate" style={{ color: 'var(--c-muted)' }}>{g.cls}</span>
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--c-border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(g.max*100).toFixed(0)}%`, background: '#60a5fa' }} />
                    </div>
                    <span className="text-xs font-mono w-10 text-right" style={{ color: 'var(--c-dim)' }}>{(g.max*100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Summary */}
          {record.aiSummary && (
            <div>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--c-dim)' }}>Заключение ИИ</p>
              <div className="rounded-xl p-4 text-sm leading-relaxed" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}>
                {record.aiSummary}
              </div>
            </div>
          )}

          {/* Demographics */}
          {record.demographics && (
            <div>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--c-dim)' }}>Данные пациента</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Возраст', `${record.demographics.age} лет`],
                  ['Пол', record.demographics.sex === 1 ? 'Мужской' : 'Женский'],
                  record.demographics.sbp         && ['АД сист.', `${record.demographics.sbp} мм рт.ст.`],
                  record.demographics.cholesterol && ['Холестерин', `${record.demographics.cholesterol} ммоль/л`],
                ].filter(Boolean).map(([k, v]) => (
                  <div key={k} className="rounded-lg p-3" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
                    <p className="text-xs" style={{ color: 'var(--c-dim)' }}>{k}</p>
                    <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--c-text)' }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live stats */}
          {record.type === 'live' && (
            <div className="flex items-center gap-4 flex-wrap">
              {fmtTime(record.duration) && <Stat label="Длительность" value={fmtTime(record.duration)} />}
              {record.sampleCount && <Stat label="Образцов" value={record.sampleCount.toLocaleString()} />}
              {record.heartRate   && <Stat label="ЧСС" value={`${record.heartRate} bpm`} />}
              {record.connMode    && <Stat label="Подключение" value={record.connMode.toUpperCase()} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl px-4 py-2.5" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <p className="text-xs" style={{ color: 'var(--c-dim)' }}>{label}</p>
      <p className="text-sm font-mono font-medium mt-0.5" style={{ color: 'var(--c-text)' }}>{value}</p>
    </div>
  )
}

function MiniWaveform({ points }) {
  const pts = points.slice(-500)
  const min = Math.min(...pts), max = Math.max(...pts), range = (max - min) || 1
  const W = 600, H = 80, pad = 8
  const path = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W
    const y = H - pad - ((v - min) / range) * (H - 2 * pad)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#0c0c0c', border: '1px solid var(--c-border)' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <path d={path} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function groupPreds(preds) {
  const map = {}
  for (const p of preds) {
    if (!map[p.class]) map[p.class] = { cls: p.class, count: 0, total: 0, max: 0 }
    map[p.class].count++
    map[p.class].total += p.confidence
    map[p.class].max = Math.max(map[p.class].max, p.confidence)
  }
  return Object.values(map).map(g => ({ ...g, avg: g.total / g.count })).sort((a, b) => b.max - a.max)
}

/* ── MAIN PAGE ─────────────────────────────────────────────────────────── */

export default function History() {
  const { lang } = useLanguage()
  const { records, loaded, load, remove, clearAll } = useHistoryStore()
  const [filter, setFilter]   = useState('all')   // all | upload | live
  const [expanded, setExpanded] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [pdfLoading, setPdfLoading]     = useState(null) // record id

  useEffect(() => { load() }, [load])

  const filtered = records.filter(r => filter === 'all' || r.type === filter)

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    await remove(id)
  }

  const handlePDF = async (e, record) => {
    e.stopPropagation()
    setPdfLoading(record.id)
    try { await generatePDF(record, lang) } finally { setPdfLoading(null) }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--c-bg)' }}>
      <Nav page="sub" title="История исследований" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 border rounded-xl p-1" style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}>
            {[['all', 'Все'], ['live', 'Лайв'], ['upload', 'Снимки']].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                style={{
                  background: filter === v ? 'var(--c-accent)' : 'transparent',
                  color:      filter === v ? 'var(--c-accent-fg)' : 'var(--c-dim)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--c-dim)' }}>{filtered.length} записей</span>
            {records.length > 0 && (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border cursor-pointer"
                style={{ borderColor: 'var(--c-border)', color: 'var(--c-dim)' }}
              >
                <Trash2 size={11} />
                Очистить
              </button>
            )}
          </div>
        </div>

        {/* Confirm clear */}
        {confirmClear && (
          <div className="rounded-2xl p-4 border flex items-center justify-between gap-3" style={{ borderColor: '#ef444444', background: '#ef444411' }}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} style={{ color: '#ef4444' }} />
              <span className="text-sm" style={{ color: 'var(--c-text)' }}>Удалить всю историю?</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmClear(false)} className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--c-border)', color: 'var(--c-dim)' }}>Отмена</button>
              <button onClick={() => { clearAll(); setConfirmClear(false) }} className="text-xs px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: '#ef4444', color: '#fff' }}>Удалить</button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {loaded && filtered.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <Clock size={36} className="mx-auto" style={{ color: 'var(--c-border)' }} />
            <p className="text-sm" style={{ color: 'var(--c-dim)' }}>
              {records.length === 0 ? 'История пуста. Проведите первое исследование.' : 'Нет записей для выбранного фильтра.'}
            </p>
          </div>
        )}

        {/* Records list */}
        <div className="space-y-3">
          {filtered.map(record => (
            <div
              key={record.id}
              onClick={() => setExpanded(record)}
              className="border rounded-2xl p-4 cursor-pointer transition-colors"
              style={{ borderColor: 'var(--c-border)', background: 'var(--c-card)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--c-muted)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--c-border)'}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Left */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: record.type === 'live' ? '#22c55e18' : '#60a5fa18' }}>
                    {record.type === 'live'
                      ? <Activity size={15} style={{ color: '#22c55e' }} />
                      : <Upload size={15} style={{ color: '#60a5fa' }} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                        {record.type === 'live' ? 'Лайв-запись' : 'Загруженный снимок'}
                      </span>
                      <TopClass record={record} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs" style={{ color: 'var(--c-dim)' }}>{fmtDate(record.timestamp)}</span>
                      {record.riskData && (
                        <span className="text-xs font-medium" style={{ color: RISK_COLORS[record.riskData.risk_class] ?? 'var(--c-dim)' }}>
                          {record.riskData.risk_class}
                        </span>
                      )}
                      {record.type === 'live' && fmtTime(record.duration) && (
                        <span className="text-xs font-mono" style={{ color: 'var(--c-dim)' }}>{fmtTime(record.duration)}</span>
                      )}
                      {record.type === 'live' && record.connMode && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--c-dim)' }}>
                          {connIcon(record.connMode)}{record.connMode.toUpperCase()}
                        </span>
                      )}
                    </div>
                    {record.aiSummary && (
                      <p className="text-xs mt-1.5 line-clamp-2" style={{ color: 'var(--c-dim)' }}>{record.aiSummary}</p>
                    )}
                  </div>
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={e => handlePDF(e, record)}
                    disabled={pdfLoading === record.id}
                    className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50"
                    style={{ border: '1px solid var(--c-border)', color: 'var(--c-dim)' }}
                    title="Скачать PDF"
                  >
                    {pdfLoading === record.id
                      ? <span className="text-xs">…</span>
                      : <FileDown size={12} />}
                  </button>
                  <button
                    onClick={e => handleDelete(e, record.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                    style={{ border: '1px solid var(--c-border)', color: 'var(--c-dim)' }}
                    title="Удалить"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Mini waveform strip for live records */}
              {record.type === 'live' && record.ecgPoints?.length > 0 && (
                <div className="mt-3 rounded-xl overflow-hidden" style={{ background: '#0c0c0c', border: '1px solid var(--c-border)' }}>
                  <MiniWaveform points={record.ecgPoints} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Expanded record modal */}
      {expanded && <ExpandedRecord record={expanded} onClose={() => setExpanded(null)} lang={lang} />}
    </div>
  )
}
