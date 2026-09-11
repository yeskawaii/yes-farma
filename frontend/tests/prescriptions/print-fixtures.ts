import { mkdirSync, writeFileSync } from 'node:fs';
import { prescriptionPrintHtml } from '../../src/features/prescriptions/prescriptionPrint';
import type { Prescription } from '../../src/features/prescriptions/types';
const directory = '/tmp/yeskira-prescription-print-review';
mkdirSync(directory, { recursive: true });
for (const count of [1, 3, 30]) for (const status of ['ISSUED', 'CANCELLED'] as const) {
  const items = Array.from({ length: count }, (_, n) => ({ medication: `Medicamento de prueba ${n + 1}`, brand: '', concentration: 'Concentración prescrita', form: 'Presentación prescrita', dose: 'Dosis prescrita', route: 'Vía prescrita', frequency: 'Frecuencia prescrita', duration: 'Duración prescrita', quantity: 'Cantidad prescrita', instructions: 'Instrucciones adicionales indicadas por el profesional.' }));
  const r = { status, cancellationReason: 'Error de captura documentado', cancelledAt: '2026-09-12T02:00:00Z', snapshot: { folio: 'RX-1234567890ABCDEF1234567890ABCDEF', issuedAt: '2026-09-12T02:00:00Z', clinic: { name: 'Clínica dental de prueba', timeZone: 'America/Mexico_City' }, patient: { name: 'Paciente de prueba', birthDate: '1990-01-02' }, professional: { name: 'Profesional de prueba', license: 'TEST-123456', specialty: 'Odontología', specialtyLicense: null, address: 'Consultorio de prueba, domicilio profesional completo', phone: 'Teléfono profesional' }, items, generalInstructions: 'Indicaciones generales capturadas por el profesional.\nDocumento de prueba visual; no corresponde a un paciente real.' } } as Prescription;
  writeFileSync(`${directory}/${count}-${status}.html`, prescriptionPrintHtml(r));
}
console.log(directory);
