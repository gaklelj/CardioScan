export const EMPTY_DEMOGRAPHICS = { age: null, sex: null, sbp: null, cholesterol: null, smoking: null }
export const PATIENT_FIELDS = { age: 'sqAge', sex: 'sqSex', sbp: 'sqSbp', cholesterol: 'sqCholesterol', smoking: 'sqSmoking' }

export function missingPatientFields(demo) {
  return Object.keys(PATIENT_FIELDS).filter(key => demo?.[key] == null || demo[key] === '')
}

export function canAssessRisk(questionnaire) {
  return questionnaire != null && missingPatientFields(questionnaire.demographics).length === 0 && [0, 1].includes(questionnaire.roseFlag)
}

export function patientRows(demo = {}, t) {
  const d = demo || {}
  return Object.entries(PATIENT_FIELDS).map(([key, label]) => {
    let value = t('sqUnknown')
    if (d[key] != null && d[key] !== '') {
      if (key === 'sex') value = t(d[key] === 1 ? 'sqSexM' : 'sqSexF')
      else if (key === 'smoking') value = t(d[key] === 1 ? 'sqSmokingYes' : 'sqSmokingNo')
      else value = `${d[key]} ${t({ age: 'sqAgeUnit', sbp: 'sqSbpUnit', cholesterol: 'sqCholUnit' }[key])}`
    }
    return [t(label), value]
  })
}
