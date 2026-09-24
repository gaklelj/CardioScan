import { fireEvent, render, screen } from '@testing-library/react'
import MonitorPanel from './MonitorPanel'

// CRA's Jest 27 cannot resolve React Router 7's conditional exports.
jest.mock('react-router-dom', () => ({ Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a> }), { virtual: true })
jest.mock('../LanguageContext', () => ({ useLanguage: () => ({ lang: 'en' }) }))

const base = { mode: 'wifi', changeMode: jest.fn(), serverOnline: false, deviceConnected: false,
  status: 'idle', duration: 0, sampleCount: 0, canStart: false, start: jest.fn(), stop: jest.fn() }

test('disconnected state cannot start recording and shows current firmware instructions', () => {
  render(<MonitorPanel {...base} />)
  expect(screen.getByRole('button', { name: 'Start recording' })).toBeDisabled()
  expect(screen.getByText('CardioScan-ESP32')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'BT' })).not.toBeInTheDocument()
  expect(screen.getByText('V1')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Connection guide' })).toHaveAttribute('href', '/guide')
})

test('recording can stop while transport mode changes are disabled', () => {
  const stop = jest.fn()
  render(<MonitorPanel {...base} status="scanning" sampleCount={2500} duration={65} stop={stop} />)
  expect(screen.getByText('01:05')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'USB' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Finish recording' }))
  expect(stop).toHaveBeenCalledTimes(1)
})

test('ready state starts recording and keeps gap and queue counters separate', () => {
  const start = jest.fn()
  render(<MonitorPanel {...base} canStart serverOnline start={start} streamInfo={{ sample_rate_hz: 853.3, missing_samples: 2, frames: [{ lost_samples: 7 }] }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
  expect(start).toHaveBeenCalledTimes(1)
  expect(screen.getByText('853.3 Hz')).toBeInTheDocument()
  expect(screen.getByText('Device queue losses: 7')).toBeInTheDocument()
})

test('offers WiFi, USB and an explicitly labeled judges demo', () => {
  const { container } = render(<MonitorPanel {...base} />)
  const modes = container.querySelectorAll('.connection-modes button')
  expect(Array.from(modes, button => button.textContent)).toEqual(['WiFi', 'USB', 'Judges’ demo'])
  expect(screen.getByRole('button', { name: 'WiFi' })).toHaveAttribute('aria-pressed', 'true')
})

test('demo explains offline access and hides irrelevant connection warnings', () => {
  render(<MonitorPanel {...base} mode="demo" canStart />)
  expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled()
  expect(screen.getByText(/No ESP32 or server needed/)).toBeInTheDocument()
  expect(screen.queryByText('Offline')).not.toBeInTheDocument()
  expect(screen.queryByText('CardioScan-ESP32')).not.toBeInTheDocument()
})
