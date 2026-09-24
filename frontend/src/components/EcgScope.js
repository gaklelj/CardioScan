import { useEffect, useRef, useState } from 'react'
import { Activity, Pause, Play, SlidersHorizontal } from 'lucide-react'
import { useTheme } from '../ThemeContext'
import { useLanguage } from '../LanguageContext'
import { monitorCopy } from '../services/monitorCopy'
import { getViewport } from '../services/ecgViewport'
import { ECG_DARK_COLORS, ECG_LIGHT_COLORS } from '../services/ecgPalette'


export default function EcgScope({ recordingRef, timingRef, status, mode, sampleCount }) {
  const { theme } = useTheme()
  const { lang } = useLanguage()
  const c = monitorCopy(lang)
  const [seconds, setSeconds] = useState(5)
  const [shared, setShared] = useState(false)
  const [frozenAt, setFrozenAt] = useState(null)
  const canvasRef = useRef(null)
  const timed = timingRef.current.length > 0

  useEffect(() => { setFrozenAt(null) }, [status])

  useEffect(() => {
    let frame, lastDraw = 0
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const colors = theme === 'light' ? ECG_LIGHT_COLORS : ECG_DARK_COLORS
    const draw = now => {
      frame = requestAnimationFrame(draw)
      if (now - lastDraw < 50) return
      lastDraw = now
      const W = canvas.clientWidth, H = 586, panel = 136, left = 62, right = W - 18
      if (!W) return
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== H * dpr) {
        canvas.width = Math.round(W * dpr); canvas.height = H * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = theme === 'light' ? '#fcf4f6' : '#29171d'
      ctx.fillRect(0, 0, W, H)
      const view = getViewport(recordingRef.current, timingRef.current, seconds, frozenAt ?? undefined)
      const bounds = view.series.map(values => {
        let min = Infinity, max = -Infinity
        values.forEach(v => { min = Math.min(min, v); max = Math.max(max, v) })
        return { center: values.length ? (min + max) / 2 : 0, range: values.length ? max - min : 0 }
      })
      const commonRange = Math.max(1, ...bounds.map(b => b.range))
      for (let row = 0; row < 4; row++) {
        const top = row * panel + 10
        ctx.strokeStyle = theme === 'light' ? 'rgba(129,25,26,0.13)' : 'rgba(247,232,235,0.08)'
        ctx.lineWidth = 0.5
        for (let i = 0; i <= 50; i++) {
          const x = left + (right - left) * i / 50
          ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + panel - 6); ctx.stroke()
        }
        for (let y = top; y < top + panel - 6; y += 20) {
          ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke()
        }
        ctx.fillStyle = colors[row]
        ctx.font = '600 18px Inter, sans-serif'
        ctx.fillText(mode !== 'usb' ? ['I', 'II', 'III', 'V1'][row] : `CH${row + 1}`, 16, top + 35)
        ctx.font = '10px Inter, sans-serif'
        if (row === 2 && mode !== 'usb') ctx.fillText('II − I', 12, top + 53)
        const values = view.series[row] ?? []
        if (!values.length) {
          ctx.fillStyle = theme === 'light' ? '#654d55' : '#c2a5ae'
          ctx.font = '12px Inter, sans-serif'
          ctx.textAlign = 'center'; ctx.fillText(c.noData, (left + right) / 2, top + 68); ctx.textAlign = 'left'
          continue
        }
        const range = shared ? commonRange : Math.max(1, bounds[row].range)
        ctx.save()
        ctx.beginPath(); ctx.rect(left, top, right - left, panel - 6); ctx.clip()
        ctx.strokeStyle = colors[row]
        ctx.lineWidth = 1.4; ctx.lineJoin = 'round'
        ctx.beginPath()
        values.forEach((value, i) => {
          const x = left + view.x[i] * (right - left)
          const y = top + 63 - ((value - bounds[row].center) / range) * 92
          if (i === 0 || view.gaps[i]) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.stroke(); ctx.restore()
      }
      ctx.fillStyle = theme === 'light' ? '#654d55' : '#c2a5ae'
      ctx.font = '11px Inter, sans-serif'
      for (let i = 0; i <= 5; i++) {
        ctx.textAlign = i === 0 ? 'left' : i === 5 ? 'right' : 'center'
        const value = view.timed ? (i - 5) * seconds / 5 : (i - 5) * 100
        ctx.fillText(`${Number(value.toFixed(1))} ${view.timed ? c.seconds : c.samples}`, left + (right - left) * i / 5, H - 15)
      }
      ctx.textAlign = 'left'
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [seconds, shared, frozenAt, theme, c, mode, recordingRef, timingRef])

  return <section className="scope-card" aria-label={c.chart}>
    <header className="scope-heading">
      <div><span className="eyebrow">{mode === 'demo' ? 'Симуляция · ECG' : 'ADS1293 · ECG'}</span><h2>{c.chart}</h2></div>
      <span className={`status-pill ${status === 'scanning' ? 'is-active' : ''}`}><span className="status-dot" />{status === 'scanning' ? c.receiving : status === 'done' ? c.finished : c.waiting}</span>
    </header>
    <div className="scope-toolbar">
      <label>{c.window}<select aria-label={c.window} value={seconds} disabled={!timed} onChange={e => setSeconds(Number(e.target.value))}>
        {[2, 5, 10].map(n => <option key={n} value={n}>{n} {c.seconds}</option>)}
      </select></label>
      <button className="scope-tool" aria-pressed={shared} onClick={() => setShared(v => !v)}><SlidersHorizontal size={14} />{shared ? c.common : c.auto}</button>
      <button className="scope-tool scope-freeze" disabled={!sampleCount || status !== 'scanning'} aria-pressed={frozenAt !== null} onClick={() => setFrozenAt(v => v === null ? recordingRef.current[0].length : null)}>
        {frozenAt === null ? <Pause size={14} /> : <Play size={14} />}{frozenAt === null ? c.pause : c.resume}
      </button>
    </div>
    <canvas ref={canvasRef} className="ecg-scope-canvas" role="img" aria-label={`${c.chart}: I, II, III, V1. ${c.raw}`} />
    {!sampleCount && <div className="scope-empty"><Activity size={15} />{c.empty}</div>}
    <footer className="scope-footer"><span>{frozenAt !== null && status === 'scanning' ? c.frozen : mode === 'demo' ? 'Симуляция ЭКГ · 72 уд/мин' : c.raw}</span><span>I · II · III · V1</span></footer>
  </section>
}
