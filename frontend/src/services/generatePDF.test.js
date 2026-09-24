jest.mock('jspdf', () => jest.fn())
jest.mock('html2canvas', () => jest.fn())
import { buildHTML } from './generatePDF'

test('report preserves missing data, symptoms, quality and multiple model labels', () => {
  const html = buildHTML({ timestamp: 1, type: 'live', demographics: { age: 60, sex: null },
    symptoms: [{ question: 'Боль?', answer: '<script>alert(1)</script>' }], roseFlag: null, questionnaireVersion: 2,
    modelResult: { class: 'AF', labels: ['AF', 'CD'], all: { AF: 0.7, CD: 0.6 }, quality: 'unverified', window_seconds: 10 },
    riskData: { risk_class: 'Low', mortality_10y: 2 }, missingSamples: 3,
  })
  expect(html).toContain('Не знаю / не измерял(а)')
  expect(html).not.toContain('Женский')
  expect(html).toContain('Фибрилляция предсердий; Нарушения проводимости')
  expect(html).toContain('В записи есть пропуски')
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('10-летняя смертность')
  expect(html).not.toContain('Экспериментальная оценка')
  expect(html).toContain('Недостаточно данных')
  expect(html).not.toMatch(/undefined|NaN/)
})

test('old reports identify provenance uncertainty; simulation is explicit', () => {
  const html = buildHTML({ timestamp: 1, type: 'live', demographics: { age: 45 }, connMode: 'demo' })
  expect(html).toContain('Старая запись')
  expect(html).toContain('ДЕМОНСТРАЦИОННАЯ СИМУЛЯЦИЯ')
})
