export interface PrescriptionItem { medication: string; brand: string; concentration: string; form: string; dose: string; route: string; frequency: string; duration: string; quantity: string; instructions: string }
export interface PrescriptionSnapshot {
  clinic: { name: string; timeZone: string; clinicalSpecialty?: 'DENTISTRY' | 'PEDIATRICS' }; patient: { name: string; birthDate: string };
  professional: { name: string; license: string; specialty: string; specialtyLicense: string | null; address: string; phone: string | null };
  items: PrescriptionItem[]; generalInstructions: string; folio: string; issuedAt: string;
}
export interface Prescription { id: string; patientId: string; encounterId: string | null; prescriberMembershipId: string; status: 'DRAFT' | 'ISSUED' | 'CANCELLED'; folio: string | null; version: number; createdAt: string; issuedAt: string | null; cancelledAt: string | null; cancellationReason: string | null; items: PrescriptionItem[]; generalInstructions: string; snapshot: PrescriptionSnapshot | null; prescriber: { user: { firstName: string; lastName: string } } }
export interface ProfessionalFields { professionalLicense: string; specialtyCode: string; specialtyLicense: string; professionalAddress: string; professionalPhone: string }
export interface PrescriberProfile { name: string; clinic: string; profile: Partial<ProfessionalFields> | null }
export const labels = { DRAFT: 'Borrador', ISSUED: 'Emitida', CANCELLED: 'Anulada' };
export const itemLabels: Record<keyof PrescriptionItem, string> = { medication: 'Medicamento / nombre genérico', brand: 'Nombre comercial (opcional)', concentration: 'Concentración', form: 'Presentación / forma farmacéutica', dose: 'Dosis', route: 'Vía', frequency: 'Frecuencia', duration: 'Duración', quantity: 'Cantidad', instructions: 'Instrucciones adicionales (opcional)' };
export const emptyItem = (): PrescriptionItem => Object.fromEntries(Object.keys(itemLabels).map(k => [k, ''])) as unknown as PrescriptionItem;
export const directions = (i: PrescriptionItem) => `Administrar ${i.dose} por vía ${i.route}, ${i.frequency}, durante ${i.duration}.`;
