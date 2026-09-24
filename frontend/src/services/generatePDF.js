import { ECG_DARK_COLORS } from './ecgPalette'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const RISK_COLORS = {
  'Низкий': '#22c55e', 'Low': '#22c55e', 'Төмен': '#22c55e',
  'Умеренный': '#f59e0b', 'Moderate': '#f59e0b', 'Орташа': '#f59e0b',
  'Высокий': '#f97316', 'High': '#f97316', 'Жоғары': '#f97316',
  'Критический': '#ef4444', 'Critical': '#ef4444', 'Критикалық': '#ef4444',
}

const CLASS_COLORS = {
  STTC: '#22c55e', NOISE: '#6b7280', NORM: '#f97316',
  MI: '#ef4444', HYP: '#f59e0b', CD: '#a78bfa',
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtTime(s) {
  if (!s) return null
  const m = Math.floor(s / 60), sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
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

function miniWaveformSVG(points, channels, labels) {
  if (!points?.length) return ''
  const series = channels?.length ? channels : [points]
  const W = 700, panelHeight = 90, H = panelHeight * series.length, pad = 8
  const paths = series.map((channel, channelIndex) => {
    const pts = (channel ?? []).slice(-600)
    const min = Math.min(...pts), max = Math.max(...pts), range = (max - min) || 1
    const path = pts.map((v, i) => {
      const x = (i / Math.max(1, pts.length - 1)) * W
      const y = channelIndex * panelHeight + panelHeight - pad - ((v - min) / range) * (panelHeight - 2 * pad)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
    return { path, color: ECG_DARK_COLORS[channelIndex] }
  })
  const pathsHTML = paths.map(({ path, color }, index) => `<text x="8" y="${index * panelHeight + 14}" fill="${color}" font-size="11">${['I', 'II', 'III (II - I)', 'V1'].includes(labels?.[index]) ? labels[index] : `CH${index + 1}`}</text><path d="${path}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;display:block;background:#29171d;border-radius:8px">
    ${pathsHTML}
  </svg>`
}

function buildHTML(record, lang) {
  const typeLabel = record.type === 'live' ? 'Лайв-запись' : 'Загруженный снимок'
  const riskColor = record.riskData ? (RISK_COLORS[record.riskData.risk_class] ?? '#6b7280') : null

  const demographicsHTML = record.demographics ? `
    <div class="section">
      <div class="section-title">Данные пациента</div>
      <div class="two-col">
        <div class="kv"><span class="k">Возраст</span><span class="v">${record.demographics.age} лет</span></div>
        <div class="kv"><span class="k">Пол</span><span class="v">${record.demographics.sex === 1 ? 'Мужской' : 'Женский'}</span></div>
        ${record.demographics.sbp ? `<div class="kv"><span class="k">АД систол.</span><span class="v">${record.demographics.sbp} мм рт.ст.</span></div>` : ''}
        ${record.demographics.cholesterol ? `<div class="kv"><span class="k">Холестерин</span><span class="v">${record.demographics.cholesterol} ммоль/л</span></div>` : ''}
        ${record.demographics.smoking != null ? `<div class="kv"><span class="k">Курение</span><span class="v">${record.demographics.smoking ? 'Да' : 'Нет'}</span></div>` : ''}
      </div>
    </div>` : ''

  const riskHTML = record.riskData ? `
    <div class="section">
      <div class="section-title">Оценка кардиологического риска</div>
      <div class="risk-badge" style="border-color:${riskColor}44;background:${riskColor}18">
        <span class="risk-class" style="color:${riskColor}">${record.riskData.risk_class}</span>
        <span class="risk-mort">10-летняя смертность: <b>${record.riskData.mortality_10y?.toFixed(1) ?? '?'}%</b></span>
      </div>
      ${record.riskData.recommendation ? `<p class="rec">${record.riskData.recommendation}</p>` : ''}
    </div>` : ''

  const modelHTML = record.modelResult ? (() => {
    const mr = record.modelResult
    const col = CLASS_COLORS[mr.class] ?? '#6b7280'
    const bars = mr.all ? Object.entries(mr.all).sort(([,a],[,b]) => b-a).map(([cls, conf]) => `
      <div class="bar-row">
        <span class="bar-label">${cls}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(conf*100).toFixed(1)}%;background:${CLASS_COLORS[cls] ?? '#6b7280'}"></div></div>
        <span class="bar-pct">${(conf*100).toFixed(1)}%</span>
      </div>`).join('') : ''
    return `
    <div class="section">
      <div class="section-title">Результат нейросети</div>
      <div class="top-class" style="background:${col}18;border-color:${col}44">
        <span style="color:${col};font-weight:700">${mr.class}</span>
        <span style="color:#9ca3af;font-size:13px">${(mr.confidence * 100).toFixed(1)}%</span>
      </div>
      <div class="bars">${bars}</div>
    </div>`
  })() : ''

  const predsHTML = record.predictions?.length > 0 ? `
    <div class="section">
      <div class="section-title">Обнаруженные паттерны (${record.predictions.length})</div>
      <div class="bars">
        ${groupPreds(record.predictions).map(g => `
          <div class="bar-row">
            <span class="bar-label">${g.cls}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${(g.max*100).toFixed(0)}%;background:#60a5fa"></div></div>
            <span class="bar-pct">${(g.max*100).toFixed(0)}%  ×${g.count}</span>
          </div>`).join('')}
      </div>
    </div>` : ''

  const imageHTML = record.ecgImageBase64 ? `
    <div class="section">
      <div class="section-title">ЭКГ-снимок</div>
      <img src="${record.ecgImageBase64}" style="width:100%;border-radius:8px;border:1px solid #2d2d3a" />
    </div>` : ''

  const waveHTML = record.type === 'live' && record.ecgPoints?.length ? `
    <div class="section">
      <div class="section-title">Сигнал ЭКГ</div>
      ${miniWaveformSVG(record.ecgPoints, record.ecgChannels, record.leadLabels)}
    </div>` : ''

  const summaryHTML = record.aiSummary ? `
    <div class="section">
      <div class="section-title">Заключение ИИ</div>
      <div class="summary-box">${record.aiSummary}</div>
    </div>` : ''

  const statsHTML = record.type === 'live' ? `
    <div class="section">
      <div class="section-title">Параметры записи</div>
      <div class="two-col">
        ${fmtTime(record.duration) ? `<div class="kv"><span class="k">Длительность</span><span class="v">${fmtTime(record.duration)}</span></div>` : ''}
        ${record.sampleCount ? `<div class="kv"><span class="k">Образцов</span><span class="v">${record.sampleCount.toLocaleString()}</span></div>` : ''}
        ${record.heartRate ? `<div class="kv"><span class="k">ЧСС</span><span class="v">${record.heartRate} bpm</span></div>` : ''}
        ${record.connMode ? `<div class="kv"><span class="k">Подключение</span><span class="v">${record.connMode.toUpperCase()}</span></div>` : ''}
      </div>
    </div>` : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
    background: #ffffff;
    color: #111116;
    width: 794px;
    padding: 0;
  }
  .header {
    background: #e84040;
    padding: 18px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .header-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #fff;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }
  .header-logo svg { width: 22px; height: 22px; }
  .header-meta {
    text-align: right;
    color: rgba(255,255,255,0.85);
    font-size: 12px;
    line-height: 1.6;
  }
  .content { padding: 28px; }
  .report-title {
    font-size: 22px;
    font-weight: 700;
    color: #111116;
    margin-bottom: 4px;
  }
  .report-sub {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 24px;
  }
  .section { margin-bottom: 22px; }
  .section-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: #6b7280;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1.5px solid #e84040;
  }
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .kv {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 10px 14px;
  }
  .k { display: block; font-size: 11px; color: #9ca3af; margin-bottom: 2px; }
  .v { display: block; font-size: 13px; font-weight: 600; color: #111116; }
  .risk-badge {
    border: 1px solid;
    border-radius: 10px;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .risk-class { font-size: 16px; font-weight: 700; }
  .risk-mort { font-size: 13px; color: #374151; }
  .rec { font-size: 12px; color: #6b7280; margin-top: 8px; line-height: 1.6; }
  .top-class {
    border: 1px solid;
    border-radius: 10px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    font-size: 15px;
  }
  .bars { display: flex; flex-direction: column; gap: 7px; }
  .bar-row { display: flex; align-items: center; gap: 10px; }
  .bar-label { font-size: 12px; color: #374151; width: 52px; flex-shrink: 0; }
  .bar-track { flex: 1; height: 6px; background: #e5e7eb; border-radius: 999px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 999px; }
  .bar-pct { font-size: 11px; color: #9ca3af; width: 60px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .summary-box {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 16px;
    font-size: 13px;
    line-height: 1.7;
    color: #374151;
  }
  .footer {
    background: #e84040;
    padding: 10px 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
  }
  .footer span { font-size: 10px; color: rgba(255,255,255,0.8); }
</style>
</head>
<body>
  <div class="header">
    <div class="header-logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      CardioScan
    </div>
    <div class="header-meta">
      <div>${fmtDate(record.timestamp)}</div>
      <div>${typeLabel}</div>
    </div>
  </div>

  <div class="content">
    <div class="report-title">Отчёт кардиологического исследования</div>
    <div class="report-sub">Сформировано автоматически · Только для информационных целей</div>

    ${demographicsHTML}
    ${riskHTML}
    ${modelHTML}
    ${predsHTML}
    ${waveHTML}
    ${imageHTML}
    ${summaryHTML}
    ${statsHTML}
  </div>

  <div class="footer">
    <span>Только для информационных целей. Не является медицинским заключением.</span>
    <span>CardioScan</span>
  </div>
</body>
</html>`
}

export async function generatePDF(record, lang = 'ru') {
  // Render HTML in a hidden off-screen iframe
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1px;border:none;visibility:hidden'
  document.body.appendChild(iframe)

  const html = buildHTML(record, lang)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()

  // Wait for images to load
  await new Promise(resolve => {
    const imgs = iframe.contentDocument.querySelectorAll('img')
    if (!imgs.length) return resolve()
    let loaded = 0
    imgs.forEach(img => {
      if (img.complete) { loaded++; if (loaded === imgs.length) resolve() }
      else { img.onload = img.onerror = () => { loaded++; if (loaded === imgs.length) resolve() } }
    })
  })

  // Small delay for SVG rendering
  await new Promise(r => setTimeout(r, 200))

  const body = iframe.contentDocument.body
  const fullH = body.scrollHeight

  iframe.style.height = fullH + 'px'

  // Capture with html2canvas
  const canvas = await html2canvas(body, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    width: 794,
    height: fullH,
    windowWidth: 794,
    windowHeight: fullH,
  })

  document.body.removeChild(iframe)

  // A4 dimensions in mm
  const pdfW   = 210
  const pdfH   = (fullH / 794) * pdfW
  const pdf    = new jsPDF({ unit: 'mm', format: [pdfW, pdfH > 297 ? pdfH : 297] })
  const imgData = canvas.toDataURL('image/jpeg', 0.95)
  pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH)

  const fname = `CardioScan_${new Date(record.timestamp).toISOString().slice(0, 10)}_${record.type}.pdf`
  pdf.save(fname)
}
