import { create } from 'zustand'
import { saveRecord, getAllRecords, deleteRecord, clearAllRecords } from '../services/historyDB'

export function buildRecord({ type, ecgImageBase64, ecgPoints, ecgChannels, ecgTiming, sampleRateHz, missingSamples, leadLabels, predictions, modelResult, aiSummary, riskData, demographics, duration, sampleCount, heartRate, connMode }) {
  return {
    id:              crypto.randomUUID(),
    timestamp:       Date.now(),
    type,            // 'upload' | 'live'
    ecgImageBase64:  ecgImageBase64 ?? null,
    ecgPoints:       ecgPoints       ?? null,
    ecgTiming: ecgTiming ?? null,
    sampleRateHz: sampleRateHz ?? null,
    missingSamples: missingSamples ?? 0,
    leadLabels: leadLabels ?? null,
    ecgChannels:     ecgChannels     ?? null,
    predictions:     predictions     ?? [],
    modelResult:     modelResult     ?? null,
    aiSummary:       aiSummary       ?? null,
    riskData:        riskData        ?? null,
    demographics:    demographics    ?? null,
    duration:        duration        ?? null,
    sampleCount:     sampleCount     ?? null,
    heartRate:       heartRate       ?? null,
    connMode:        connMode        ?? null,
  }
}

const useHistoryStore = create((set, get) => ({
  records: [],
  loaded:  false,

  load: async () => {
    if (get().loaded) return
    const records = await getAllRecords()
    set({ records, loaded: true })
  },

  add: async (recordData) => {
    const record = buildRecord(recordData)
    await saveRecord(record)
    set(state => ({ records: [record, ...state.records] }))
    return record
  },

  remove: async (id) => {
    await deleteRecord(id)
    set(state => ({ records: state.records.filter(r => r.id !== id) }))
  },

  clearAll: async () => {
    await clearAllRecords()
    set({ records: [] })
  },
}))

export default useHistoryStore
