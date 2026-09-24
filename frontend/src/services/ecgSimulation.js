export const DEMO_RATE = 250
export const DEMO_BPM = 72
export const DEMO_RESULT = {
  class: 'Normal', labels: ['Норма · симуляция'], model: 'simulation',
  simulated: true, analysis_channel: 'I, II, III, V1',
}

// Illustrative sinus cycle, in mV: P wave, narrow QRS and smooth T wave.
// Lead III obeys Einthoven's relation; V1 has a small R and dominant S.
export function simulatedSample(index) {
  const phase = (index / DEMO_RATE) % (60 / DEMO_BPM)
  const wave = (center, width) => Math.exp(-0.5 * ((phase - center) / width) ** 2)
  const p = wave(0.14, 0.025), q = wave(0.285, 0.009)
  const r = wave(0.31, 0.01), s = wave(0.335, 0.012), t = wave(0.54, 0.055)
  const leadI = 0.12 * p - 0.08 * q + 0.85 * r - 0.16 * s + 0.26 * t
  const leadII = 0.16 * p - 0.10 * q + 1.2 * r - 0.22 * s + 0.34 * t
  const v1 = 0.06 * p + 0.25 * r - 0.75 * s + 0.08 * t
  return [leadI, leadII, leadII - leadI, v1]
}
