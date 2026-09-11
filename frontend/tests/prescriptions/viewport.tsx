import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../../src/core/auth/AuthProvider';
import { PrescriptionSection } from '../../src/features/prescriptions/PrescriptionSection';
import { prescriptionPrintHtml } from '../../src/features/prescriptions/prescriptionPrint';
import { itemLabels } from '../../src/features/prescriptions/types';
import './styles.css';
const id = '00000000-0000-4000-8000-000000000001';
let rows: any[] = []; let mutations = 0;
const profile = { professionalLicense: 'TEST-123', specialtyCode: 'Odontología', specialtyLicense: '', professionalAddress: 'Consultorio de prueba', professionalPhone: '' };
window.fetch = async (input, init) => {
  const path = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  if (body) mutations++;
  let result: unknown;
  if (path.endsWith('/auth/me')) result = { user: { id, firstName: 'Nombre', lastName: 'Profesional' }, memberships: [{ id, clinicId: id, role: 'OWNER' }], activeClinicId: id, activeRole: 'OWNER' };
  else if (path.endsWith('/profile')) result = { name: 'Nombre Profesional', clinic: 'Clínica de prueba', profile };
  else if (path.endsWith('/issue')) { Object.assign(rows[0], { status: 'ISSUED', folio: 'RX-TEST', issuedAt: '2026-09-12T02:00:00Z', version: 3, snapshot: { clinic: { name: 'Clínica de prueba', timeZone: 'America/Mexico_City' }, patient: { name: 'Paciente <original>', birthDate: '1990-01-02' }, professional: { name: 'Nombre Profesional', license: 'TEST-123', address: 'Consultorio de prueba', specialty: 'Odontología' }, items: structuredClone(rows[0].items), generalInstructions: rows[0].generalInstructions, folio: 'RX-TEST', issuedAt: '2026-09-12T02:00:00Z' } }); result = rows[0]; }
  else if (path.endsWith('/cancel')) { Object.assign(rows[0], { status: 'CANCELLED', cancellationReason: body.reason, cancelledAt: '2026-09-12T03:00:00Z', version: 4 }); result = rows[0]; }
  else if (body) { const r = { ...body, id: 'rx', prescriberMembershipId: id, status: 'DRAFT', version: rows.length ? 2 : 1, createdAt: '2026-09-11T20:00:00Z', snapshot: null, folio: null, prescriber: { user: { firstName: 'Nombre', lastName: 'Profesional' } } }; rows = [r]; result = r; }
  else if (path.endsWith('/rx')) result = rows[0];
  else result = rows;
  return new Response(JSON.stringify(result), { status: 200 });
};
const root = createRoot(document.getElementById('root')!);
const results: string[] = [];
const check = (v: unknown, message: string) => { if (!v) throw new Error(message); results.push(message); };
const tick = () => new Promise(r => setTimeout(r, 60));
const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
async function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) { Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); await tick(); }
async function run() {
  root.render(<AuthProvider><PrescriptionSection patientId={id} patientName="Paciente original" /></AuthProvider>); await tick(); await tick(); await tick();
  button('Nueva receta').click(); await tick();
  check(document.querySelector('[role="dialog"]')?.contains(document.activeElement), 'Modal captura el foco');
  const values = ['Medicamento de prueba', '', '10 mg', 'Tableta', '1 tableta', 'Oral', 'Frecuencia indicada', 'Duración indicada', 'Cantidad indicada', 'Instrucción adicional'];
  const fields = [...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input')];
  check(fields.length === Object.keys(itemLabels).length, 'Campos estructurados completos');
  for (let i = 0; i < fields.length; i++) await setValue(fields[i]!, values[i]!);
  check(document.documentElement.scrollWidth <= window.innerWidth, 'Formulario sin desbordamiento horizontal');
  await setValue(document.querySelector('textarea')!, 'Indicaciones generales originales');
  button('Agregar medicamento').click(); await tick(); check(document.querySelectorAll('fieldset').length === 2, 'Permite varios medicamentos');
  [...document.querySelectorAll('button')].filter(b => b.textContent?.includes('Eliminar medicamento'))[1]!.click(); await tick();
  button('Guardar borrador').click(); await tick(); await tick();
  check(rows[0].items[0].dose === '1 tableta' && rows[0].folio === null, 'Guardar borrador estructurado sin folio');
  button('Editar borrador').click(); await tick(); button('Guardar borrador').click(); await tick(); await tick();
  check(rows[0].version === 2, 'Edita borrador con versión');
  button('Confirmar y emitir').click(); await tick(); await tick();
  check(!button('Editar borrador') && !button('Confirmar y emitir'), 'Emitida bloquea edición y emisión');
  let printed = ''; window.open = (() => ({ opener: null, document: { open() {}, write(html: string) { printed = html; }, close() {} }, close() {} })) as any;
  const before = mutations; button('Vista de impresión').click(); await tick(); await tick();
  check(mutations === before && printed.includes('RX-TEST') && printed.includes('size:letter'), 'Impresión carta no muta la receta');
  check(printed.includes('Paciente &lt;original&gt;') && !printed.includes('Paciente <original>'), 'Escapa HTML clínico');
  check(printed.includes('11/9/2026') && printed.includes('02/01/1990'), 'Fecha en zona clínica y nacimiento sin desplazamiento UTC');
  check(printed.includes('Firma del profesional') && printed.includes('Guardar como PDF'), 'Firma física y PDF disponibles');
  const original = printed; button('Vista de impresión').click(); await tick(); await tick(); check(printed === original, 'Reimpresión conserva documento exacto');
  button('Anular receta').click(); await tick(); await setValue(document.querySelector('textarea')!, 'Error de captura'); button('Confirmar anulación').click(); await tick(); await tick();
  check(document.body.textContent?.includes('RECETA ANULADA'), 'Anulación visible en detalle');
  button('Vista de impresión').click(); await tick(); await tick(); check(printed.includes('RECETA ANULADA') && printed.includes('RX-TEST') && printed.includes('Error de captura'), 'PDF anulado preserva folio y muestra estado y motivo');
  let rejected = false; try { prescriptionPrintHtml({ ...rows[0], status: 'DRAFT' }); } catch { rejected = true; } check(rejected, 'No permite imprimir borrador como receta final');
  check(document.documentElement.scrollWidth <= window.innerWidth, 'Detalle sin desbordamiento horizontal');
  document.body.dataset.prescriptionTests = 'passed';
}
run().catch(e => { results.push(`FAIL: ${e.message}`); document.body.dataset.prescriptionTests = 'failed'; }).finally(() => { document.getElementById('prescription-test-results')!.textContent = results.join('\n'); });
