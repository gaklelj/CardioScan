import { fireEvent, render, screen } from '@testing-library/react'
import SymptomsModal from './SymptomsModal'
import { canAssessRisk } from '../services/patientData'
import translations from '../translations'

const t = key => translations.ru[key] || key

test('blank questionnaire stays unknown when skipped, including symptoms', () => {
  const onSubmit = jest.fn()
  render(<SymptomsModal open onSubmit={onSubmit} onClose={() => {}} t={t} />)
  expect(screen.getByLabelText(/Возраст/)).toHaveValue(null)
  fireEvent.click(screen.getByText(t('sqSkip')))
  const data = onSubmit.mock.calls[0][0]
  expect(Object.values(data.demographics)).toEqual([null, null, null, null, null])
  expect(data.roseFlag).toBeNull()
  expect(canAssessRisk(data)).toBe(false)
})

test('entered values survive skipping; clearing measurements restores unknown', () => {
  const onSubmit = jest.fn()
  render(<SymptomsModal open onSubmit={onSubmit} onClose={() => {}} t={t} />)
  fireEvent.change(screen.getByLabelText(/Возраст/), { target: { value: '56' } })
  const bp = screen.getByLabelText(new RegExp(t('sqSbp')))
  fireEvent.change(bp, { target: { value: '137' } })
  fireEvent.change(bp, { target: { value: '' } })
  fireEvent.click(screen.getByText(t('sqSkip')))
  expect(onSubmit.mock.calls[0][0].demographics).toMatchObject({ age: 56, sbp: null, sex: null })
})

test('complete demographics require a completed symptom questionnaire', () => {
  const demographics = { age: 45, sex: 0, sbp: 120, cholesterol: 5, smoking: 0 }
  expect(canAssessRisk({ demographics, roseFlag: null })).toBe(false)
  expect(canAssessRisk({ demographics, roseFlag: 0 })).toBe(true)
})
