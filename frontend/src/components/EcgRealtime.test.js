import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import EcgRealtime from './EcgRealtime'

const mockHandlers = {}
const mockSocket = { on: jest.fn((name, fn) => { mockHandlers[name] = fn }), emit: jest.fn(), disconnect: jest.fn() }
const mockAdd = jest.fn(async data => ({ ...data, id: 'record-1' }))
jest.mock('socket.io-client', () => ({ io: () => mockSocket }))
jest.mock('../LanguageContext', () => ({ useLanguage: () => ({ t: key => key }) }))
jest.mock('../store/useHistoryStore', () => {
  const hook = () => ({ add: mockAdd })
  hook.getState = () => ({ records: [] })
  return { __esModule: true, default: hook }
})
jest.mock('../services/historyDB', () => ({ saveRecord: jest.fn() }))
jest.mock('./MonitorPanel', () => props => <div>
  <button onClick={props.start} disabled={!props.canStart}>Start</button>
  <button onClick={props.stop}>Stop</button>
  <span data-testid="status">{props.status}</span>
  <span data-testid="count">{props.sampleCount}</span>
</div>)
jest.mock('./EcgScope', () => () => null)
jest.mock('./SymptomsModal', () => ({ __esModule: true, default: () => null, SymptomsCard: () => null }))
jest.mock('./RiskAssessmentCard', () => () => null)

beforeEach(() => {
  jest.useFakeTimers()
  mockSocket.on.mockImplementation((name, fn) => { mockHandlers[name] = fn })
  mockAdd.mockImplementation(async data => ({ ...data, id: 'record-1' }))
  mockSocket.emit.mockClear()
  global.fetch = jest.fn(async () => ({ json: async () => ({ class: 'NORM', model: 'ecg_ads1293', confidence: 0.5 }) }))
})
afterEach(() => { jest.useRealTimers(); delete global.fetch })

test.each(['stop', 'device', 'server'])('records beyond ten seconds and saves all four leads once on %s', async ending => {
  render(<EcgRealtime />)
  act(() => mockHandlers.connect())
  fireEvent.click(screen.getByText('Start'))
  const frames = Array.from({ length: 3000 }, (_, i) => ({
    channels: [i, i + 10, 10, i + 20], timestamp_us: i * 10000, sequence: i, lost_samples: 0,
  }))
  act(() => {
    jest.advanceTimersByTime(30000)
    mockHandlers.ecg_frames({ frames, sample_rate_hz: 100, missing_samples: 0 })
  })
  expect(screen.getByTestId('status')).toHaveTextContent('scanning')
  expect(screen.getByTestId('count')).toHaveTextContent('3000')
  expect(mockAdd).not.toHaveBeenCalled()
  await act(async () => {
    if (ending === 'stop') fireEvent.click(screen.getByText('Stop'))
    else if (ending === 'device') mockHandlers.device_status({ connected: false })
    else mockHandlers.disconnect()
    mockHandlers.device_status({ connected: false })
  })
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
  expect(mockAdd).toHaveBeenCalledTimes(1)
  const record = mockAdd.mock.calls[0][0]
  expect(record.ecgChannels).toHaveLength(4)
  expect(record.ecgChannels.every(ch => ch.length === 3000)).toBe(true)
  expect(record.ecgChannels[3][2999]).toBe(3019)
  expect(record.ecgTiming).toHaveLength(3000)
  expect(record.leadLabels).toEqual(['I', 'II', 'III (II - I)', 'V1'])
  expect(record.duration).toBe(30)
  const payload = JSON.parse(global.fetch.mock.calls[0][1].body)
  expect(payload.channels).toHaveLength(3)
  expect(payload.channels[0]).toHaveLength(1101)
  expect(payload.timing).toHaveLength(1101)
  expect(screen.getByTestId('status')).toHaveTextContent('done')
})
