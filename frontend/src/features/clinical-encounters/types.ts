import type { AppointmentStatus } from '../appointments/types';

export type ClinicalEncounterStatus = 'DRAFT' | 'FINALIZED';

export type PatientSexAtBirth = 'FEMALE' | 'MALE' | 'INTERSEX' | 'UNKNOWN';

export interface ClinicalEncounterPatient {
  id: string;
  displayName: string;
  birthDate: string | null;
  sexAtBirth: PatientSexAtBirth | null;
}

export interface ClinicalEncounterProfessional {
  displayName: string;
}

export interface ClinicalEncounterAppointment {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
}

export interface ClinicalVitalSigns {
  systolicBloodPressure: number | null;
  diastolicBloodPressure: number | null;
  heartRate: number | null;
  respiratoryRate: number | null;
  temperatureCelsius: string | null;
  oxygenSaturationPercent: number | null;
  weightKg: string | null;
  heightCm: number | null;
  measuredAt: string;
}

export interface ClinicalDiagnosis {
  id: string;
  description: string;
  code: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface ClinicalProcedure {
  id: string;
  description: string;
  code: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ClinicalEncounterAmendment {
  id: string;
  reason: string;
  note: string;
  createdAt: string;
  author: {
    displayName: string;
  };
}

export interface CreateClinicalEncounterInput {
  patientId: string;
  appointmentId?: string;
  occurredAt: string;
}

export interface ClinicalEncounterCreateResponse {
  id: string;
  occurredAt: string;
  status: ClinicalEncounterStatus;
  version: number;
  patient: {
    id: string;
    displayName: string;
  };
  professional: {
    id: string;
    displayName: string;
  };
  appointment: {
    id: string;
    startAt: string;
    endAt: string;
    status: AppointmentStatus;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalEncounterAdministrativeListItem {
  id: string;
  occurredAt: string;
  status: ClinicalEncounterStatus;
  professional: {
    displayName: string;
  };
  appointment: {
    startAt: string;
    status: AppointmentStatus;
  } | null;
  createdAt: string;
}

export interface ClinicalEncounterClinicalListItem {
  id: string;
  occurredAt: string;
  status: ClinicalEncounterStatus;
  professional: {
    displayName: string;
  };
  appointment: {
    startAt: string;
    endAt: string;
    status: AppointmentStatus;
  } | null;
  createdAt: string;
  version: number;
  updatedAt: string;
}

export type ClinicalEncounterListItem =
  | ClinicalEncounterAdministrativeListItem
  | ClinicalEncounterClinicalListItem;

export interface ClinicalEncounterDetail {
  id: string;
  occurredAt: string;
  status: ClinicalEncounterStatus;
  version: number;
  reasonForVisit: string | null;
  relevantHistory: string | null;
  allergies: string | null;
  currentMedications: string | null;
  physicalExamination: string | null;
  indications: string | null;
  clinicalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  patient: ClinicalEncounterPatient;
  professional: ClinicalEncounterProfessional;
  finalizedBy: {
    displayName: string;
  } | null;
  appointment: ClinicalEncounterAppointment | null;
  vitalSigns: ClinicalVitalSigns | null;
  diagnoses: ClinicalDiagnosis[];
  procedures: ClinicalProcedure[];
  amendments: ClinicalEncounterAmendment[];
}

export interface VitalSignsInput {
  systolicBloodPressure?: number | null;
  diastolicBloodPressure?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  temperatureCelsius?: number | null;
  oxygenSaturationPercent?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  measuredAt?: string;
}

export interface DiagnosisInput {
  description: string;
  code?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface ProcedureInput {
  description: string;
  code?: string | null;
  notes?: string | null;
  sortOrder?: number;
}

export interface UpdateClinicalEncounterInput {
  version: number;
  occurredAt?: string;
  reasonForVisit?: string | null;
  relevantHistory?: string | null;
  allergies?: string | null;
  currentMedications?: string | null;
  physicalExamination?: string | null;
  indications?: string | null;
  clinicalNotes?: string | null;
  vitalSigns?: VitalSignsInput | null;
  diagnoses?: DiagnosisInput[];
  procedures?: ProcedureInput[];
}

export interface ClinicalEncountersFilters {
  patientId: string;
  page?: number;
  pageSize?: number;
}
