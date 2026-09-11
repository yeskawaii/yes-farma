import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { prescriptionPrintHtml } from '../../src/features/prescriptions/prescriptionPrint';
import type { Prescription } from '../../src/features/prescriptions/types';
const directory = '/tmp/yeskira-prescription-print-review';
mkdirSync(directory, { recursive: true });
for (const count of [1, 3, 30]) for (const status of ['ISSUED', 'CANCELLED'] as const) {
  const items = Array.from({ length: count }, (_, n) => ({ medication: `Medicamento de prueba ${n + 1}`, brand: '', concentration: 'Concentración prescrita', form: 'Presentación prescrita', dose: '1 cápsula', route: 'Oral', frequency: 'Cada 8 horas', duration: '7 días', quantity: 'Cantidad prescrita', instructions: 'Instrucciones adicionales indicadas por el profesional.' }));
  const r = { status, cancellationReason: 'Error de captura documentado', cancelledAt: '2026-09-12T02:00:00Z', snapshot: { folio: 'RX-12345678-1234-1234-1234-123456789abc', issuedAt: '2026-09-12T02:00:00Z', clinic: { name: 'Clínica dental de prueba', timeZone: 'America/Mexico_City' }, patient: { name: 'Paciente de prueba', birthDate: '1990-01-02' }, professional: { name: 'Profesional de prueba', license: 'TEST-123456', specialty: 'DENTISTRY', specialtyLicense: 'ESP-123456', address: 'Consultorio de prueba, domicilio profesional completo', phone: 'Teléfono profesional' }, items, generalInstructions: 'Indicaciones generales capturadas por el profesional.\nDocumento de prueba visual; no corresponde a un paciente real.' } } as Prescription;
  const original = JSON.stringify(r);
  const html = prescriptionPrintHtml(r);
  assert.equal(JSON.stringify(r), original, 'Printing must preserve the original snapshot');
  assert.equal(prescriptionPrintHtml(r), html, 'Reprinting must be deterministic');
  assert.ok(html.includes('Tomar 1 cápsula por vía oral cada 8 horas durante 7 días.'));
  assert.ok(html.includes('Odontología') && !html.includes('DENTISTRY'));
  assert.ok(html.includes('Cédula de especialidad: ESP-123456'));
  assert.ok(!html.includes('Folio interno') && !html.includes('Para firma física'));
  assert.ok(html.includes(r.snapshot!.folio));
  const otherRoute = structuredClone(r);
  otherRoute.snapshot!.items[0].route = 'Intramuscular';
  assert.ok(prescriptionPrintHtml(otherRoute).includes('Administrar 1 cápsula por vía intramuscular'));
  assert.throws(() => prescriptionPrintHtml({ ...r, status: 'DRAFT' }));
  writeFileSync(`${directory}/${count}-${status}.html`, html);
}
console.log(directory);
