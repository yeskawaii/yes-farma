import { AppError } from '../../shared/errors/AppError';

const shared = {
  patients: true, appointments: true, encounters: true, documents: true,
  prescriptions: true, treatmentPlans: true, budgets: true, payments: true, inventory: true,
} as const;

// Authoritative policy. The session serializes these capabilities for the UI.
export const clinicalSpecialties = {
  DENTISTRY: { label: 'Odontología', capabilities: { ...shared, odontogram: true, dentalClinicalTools: true } },
  PEDIATRICS: { label: 'Pediatría', capabilities: { ...shared, odontogram: false, dentalClinicalTools: false } },
} as const;
export type ClinicalSpecialty = keyof typeof clinicalSpecialties;
export type ClinicCapability = keyof typeof clinicalSpecialties.DENTISTRY.capabilities;
export function capabilitiesFor(specialty: ClinicalSpecialty) {
  return clinicalSpecialties[specialty].capabilities;
}
export function assertCapability(specialty: ClinicalSpecialty, capability: ClinicCapability) {
  if (!capabilitiesFor(specialty)[capability]) {
    throw new AppError('CLINIC_CAPABILITY_DISABLED', 'Esta herramienta no corresponde a la especialidad de la clínica.', 403);
  }
}

export function specialtiesWithCapability(capability: ClinicCapability): ClinicalSpecialty[] {
  return (Object.keys(clinicalSpecialties) as ClinicalSpecialty[]).filter(specialty => capabilitiesFor(specialty)[capability]);
}
