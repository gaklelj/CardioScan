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
  <button onClick={() => props.changeMode('wifi')}>WiFi</button>
  <button onClick={() => props.changeMode('usb')}>USB</button>
  <button onClick={() => props.changeMode('demo')}>Demo</button>
  <span data-testid="mode">{props.mode}</span>
  <button onClick={props.start} disabled={!props.canStart}>Start</button>
  <button onClick={props.stop}>Stop</button>
  <span data-testid="status">{props.status}</span>
  <span data-testid="count">{props.sampleCount}</span>
</div>)
jest.mock('./EcgScope', () => () => null)
jest.mock('./SymptomsModal', () => ({ __esModule: true, default: ({ open }) => open ? <div data-testid="questionnaire" /> : null, SymptomsCard: () => null }))
jest.mock('./RiskAssessmentCard', () => () => null)

beforeEach(() => {
  jest.useFakeTimers()
  mockSocket.on.mockImplementation((name, fn) => { mockHandlers[name] = fn })
  mockAdd.mockImplementation(async data => ({ ...data, id: 'record-1' }))
  mockSocket.emit.mockClear()
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ class: 'NORM', model: 'ecg_ads1293', confidence: 0.5 }) }))
})
afterEach(() => { jest.useRealTimers(); delete global.fetch })

const testFrames = (start, count) => Array.from({ length: count }, (_, j) => {
  const i = start + j
  return { channels: [i, i + 10, 10, i + 20], timestamp_us: i * 8000, sequence: i, lost_samples: 0 }
})

test('judges can view graphs offline without device events, analysis or patient records', async () => {
  render(<EcgRealtime />)
  fireEvent.click(screen.getByText('Demo'))
  expect(screen.getByText('Start')).toBeEnabled()
  fireEvent.click(screen.getByText('Start'))
  act(() => {
    jest.advanceTimersByTime(12000)
    mockHandlers.disconnect()
    mockHandlers.device_status({ connected: false })
    mockHandlers.ecg_error({ error: 'No ESP32' })
    mockHandlers.ecg_frames({ frames: testFrames(0, 100), sample_rate_hz: 125 })
    mockHandlers.ecg_point(testFrames(0, 1)[0])
    mockHandlers.ecg_analysis({ class: 'HYP', confidence: .9 })
  })
  expect(screen.getByTestId('status')).toHaveTextContent('scanning')
  expect(screen.getByTestId('count')).toHaveTextContent('1501')
  expect(screen.queryByText('HYP')).not.toBeInTheDocument()
  expect(screen.queryByText('ecgAwaitingAnalysis')).not.toBeInTheDocument()
  expect(global.fetch).not.toHaveBeenCalled()
  expect(mockSocket.emit).not.toHaveBeenCalledWith('start_ecg', expect.anything())
  await act(async () => fireEvent.click(screen.getByText('Stop')))
  expect(mockAdd).not.toHaveBeenCalled()
  act(() => jest.advanceTimersByTime(2000))
  expect(screen.getByTestId('count')).toHaveTextContent('1501')
  fireEvent.click(screen.getByText('WiFi'))
  expect(screen.getByTestId('count')).toHaveTextContent('0')
  expect(screen.getByText('Start')).toBeDisabled()
  expect(screen.getByText('ecgAwaitingAnalysis')).toBeInTheDocument()
})

test('demo timer stops on unmount', () => {
  const { unmount } = render(<EcgRealtime />)
  fireEvent.click(screen.getByText('Demo'))
  fireEvent.click(screen.getByText('Start'))
  unmount()
  expect(jest.getTimerCount()).toBe(0)
})

test.each(['WiFi', 'USB'])('analyzes during %s streaming and keeps the last result while updating', async mode => {
  render(<EcgRealtime />)
  expect(screen.getByText('ecgAwaitingAnalysis')).toBeInTheDocument()
  act(() => mockHandlers.connect())
  fireEvent.click(screen.getByText(mode))
  fireEvent.click(screen.getByText('Start'))
  const receive = frames => {
    if (mode === 'USB') frames.forEach(mockHandlers.ecg_point)
    else mockHandlers.ecg_frames({ frames, sample_rate_hz: 125, missing_samples: 0 })
  }
  await act(async () => { receive(testFrames(0, 1125)); jest.advanceTimersByTime(9000) })
  expect(global.fetch).not.toHaveBeenCalled()
  await act(async () => { receive(testFrames(1125, 125)); jest.advanceTimersByTime(1000) })
  expect(global.fetch).toHaveBeenCalledTimes(1)
  expect(screen.getByText('NORM')).toBeInTheDocument()
  expect(screen.getByTestId('status')).toHaveTextContent('scanning')
  expect(screen.queryByTestId('questionnaire')).not.toBeInTheDocument()
  expect(mockAdd).not.toHaveBeenCalled()
  let resolveNext
  global.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveNext = resolve }))
  await act(async () => { receive(testFrames(1250, 250)); jest.advanceTimersByTime(2000) })
  expect(screen.getByText('NORM')).toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledTimes(2)
  await act(async () => { receive(testFrames(1500, 250)); jest.advanceTimersByTime(2000) })
  expect(global.fetch).toHaveBeenCalledTimes(2)
  await act(async () => resolveNext({ ok: true, json: async () => ({ class: 'NOISE', confidence: 0.9, model: 'ecg_ads1293' }) }))
  expect(screen.getByText('NOISE')).toBeInTheDocument()
  await act(async () => fireEvent.click(screen.getByText('Stop')))
  expect(mockAdd.mock.calls[0][0].modelResult.class).toBe('NOISE')
  expect(screen.queryByTestId('questionnaire')).not.toBeInTheDocument()
  expect(screen.getByText('NORM')).toBeInTheDocument()
  fireEvent.click(screen.getByText('ecgOpenQuestionnaire'))
  expect(screen.getByTestId('questionnaire')).toBeInTheDocument()
})

test('an aborted live response cannot replace the final analysis', async () => {
  let resolveLive
  global.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveLive = resolve }))
  render(<EcgRealtime />)
  act(() => mockHandlers.connect())
  fireEvent.click(screen.getByText('Start'))
  await act(async () => {
    mockHandlers.ecg_frames({ frames: testFrames(0, 1500), sample_rate_hz: 125, missing_samples: 0 })
    jest.advanceTimersByTime(1000)
  })
  const liveSignal = global.fetch.mock.calls[0][1].signal
  await act(async () => fireEvent.click(screen.getByText('Stop')))
  expect(liveSignal.aborted).toBe(true)
  expect(screen.getByText('NORM')).toBeInTheDocument()
  await act(async () => resolveLive({ ok: true, json: async () => ({ class: 'stale', confidence: 1 }) }))
  expect(screen.queryByText('stale')).not.toBeInTheDocument()
  expect(screen.getByText('NORM')).toBeInTheDocument()
})

test.each(['stop', 'device', 'server'])('records beyond ten seconds and saves all four leads once on %s', async ending => {
  render(<EcgRealtime />)
  fireEvent.click(screen.getByText('WiFi'))
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

test('defaults to WiFi and requires the backend before starting', () => {
  render(<EcgRealtime />)
  expect(screen.getByTestId('mode')).toHaveTextContent('wifi')
  expect(screen.getByText('Start')).toBeDisabled()
  act(() => mockHandlers.connect())
  expect(mockSocket.emit).toHaveBeenCalledWith('check_ecg_device', { mode: 'wifi' })
  fireEvent.click(screen.getByText('Start'))
  expect(mockSocket.emit).toHaveBeenCalledWith('start_ecg', { mode: 'wifi' })
})

test.each(['WiFi', 'USB'])('shows a short-recording error and preserves data over %s', async mode => {
  global.fetch.mockResolvedValue({ ok: false, status: 400,
    json: async () => ({ error: 'At least 10 seconds of ECG are required' }) })
  render(<EcgRealtime />)
  act(() => mockHandlers.connect())
  fireEvent.click(screen.getByText(mode))
  fireEvent.click(screen.getByText('Start'))
  const frames = Array.from({ length: 375 }, (_, i) => ({
    channels: [8388608+i, 8388618+i, 10, 8388628+i],
    timestamp_us: i*8000, sequence: i, lost_samples: 0,
  }))
  act(() => {
    if (mode === 'USB') frames.forEach(frame => mockHandlers.ecg_point(frame))
    else mockHandlers.ecg_frames({ frames, sample_rate_hz: 125, missing_samples: 0 })
  })
  await act(async () => fireEvent.click(screen.getByText('Stop')))
  expect(screen.getByText('ecgErrorTooShort')).toBeInTheDocument()
  expect(screen.queryByText('errorInference')).not.toBeInTheDocument()
  expect(mockAdd.mock.calls[0][0].ecgTiming).toHaveLength(375)
  expect(mockAdd.mock.calls[0][0].ecgChannels[0]).toHaveLength(375)
  const payload = JSON.parse(global.fetch.mock.calls[0][1].body)
  expect(payload.timing).toHaveLength(375)
})
