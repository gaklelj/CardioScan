import { missingPatientFields, PATIENT_FIELDS } from '../services/patientData'

export default function PatientDataStatus({ questionnaire, t }) {
  if (!questionnaire) return null
  const missing = missingPatientFields(questionnaire.demographics).map(key => t(PATIENT_FIELDS[key]))
  if (questionnaire.roseFlag == null) missing.push(t('sqPhaseRose'))
  if (!missing.length) return null
  return <p role="status" className="text-sm p-4 border rounded-xl" style={{ color: 'var(--c-muted)', borderColor: 'var(--c-border)' }}>
    {t('sqIncomplete')}: {missing.join(', ')}. {t('sqIncompleteHelp')}
  </p>
}
