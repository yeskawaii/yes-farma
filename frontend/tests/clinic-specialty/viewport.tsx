import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth, useClinicCapabilities } from '../../src/core/auth/AuthProvider';
import { PatientDetail } from '../../src/features/patients/PatientDetail';
import { EncounterEditor } from '../../src/features/clinical-encounters/EncounterEditor';
import { TreatmentEditor } from '../../src/features/treatment-plans/TreatmentEditor';
import { ClinicSettings } from '../../src/features/clinic-configuration/ClinicSettings';
import { prescriptionPrintHtml } from '../../src/features/prescriptions/prescriptionPrint';
import { capabilitiesFor } from '../../../backend/src/modules/clinic-configuration/capabilities';
import './styles.css';
const id = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
let specialty: 'DENTISTRY' | 'PEDIATRICS' = 'PEDIATRICS';
let role = 'OWNER';
let activeClinicId = id;
let writes: any[] = [];
let requests: string[] = [];
let encounter: any;
const resetEncounter = () => { encounter = { id, occurredAt: '2026-09-12T12:00:00Z', createdAt: '2026-09-12T12:00:00Z', updatedAt: '2026-09-12T12:00:00Z', status: 'DRAFT', version: 1, patient: { id, displayName: 'Paciente Prueba' }, professional: { membershipId: id, displayName: 'Profesional' }, appointment: null, diagnoses: [], procedures: [], amendments: [], vitalSigns: null }; };
resetEncounter();
window.fetch = async (input, init) => {
  const path = String(input); requests.push(path);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  if (body) writes.push({ path, body: structuredClone(body) });
  let result: unknown;
  if (path.endsWith('/auth/me')) result = { user: { id, firstName: 'Prueba', lastName: 'Profesional' }, memberships: [{ id, clinicId: id, clinicName: 'Clínica activa', role, clinicalSpecialty: specialty, specialtyCode: role === 'ASSISTANT' ? undefined : 'DENTISTRY', clinicCapabilities: capabilitiesFor(specialty) }, { id: otherId, clinicId: otherId, clinicName: 'Otra clínica', role, clinicalSpecialty: 'DENTISTRY', clinicCapabilities: capabilitiesFor('DENTISTRY') }], activeClinicId, activeRole: role, clinicalSpecialties: [{ code: 'DENTISTRY', label: 'Odontología' }, { code: 'PEDIATRICS', label: 'Pediatría' }] };
  else if (path === `/api/patients/${id}`) result = { id, firstName: 'Paciente', lastName: 'Prueba', birthDate: '2024-01-02', status: 'ACTIVE', createdAt: '2026-09-12T12:00:00Z', updatedAt: '2026-09-12T12:00:00Z', guardianName: 'Responsable de prueba' };
  else if (path === `/api/clinical-encounters/${id}`) { if (body) { Object.assign(encounter, body, { version: encounter.version + 1 }); if (encounter.vitalSigns) { for (const field of ['weightKg', 'temperatureCelsius']) if (encounter.vitalSigns[field] != null) encounter.vitalSigns[field] = String(encounter.vitalSigns[field]); } } result = encounter; }
  else if (path.endsWith('/profile')) result = { profile: {}, name: 'Profesional', clinic: 'Prueba' };
  else if (path.includes('/prescriptions/') || path.endsWith('/professionals')) result = [];
  else result = { items: [], total: 0, totalPages: 0, page: 1, pageSize: 20 };
  return new Response(JSON.stringify(result), { status: 200 });
};
const root = createRoot(document.getElementById('root')!);
const results: string[] = [];
const check = (v: unknown, message: string) => { if (!v) throw new Error(message); results.push(message); };
const tick = () => new Promise(r => setTimeout(r, 50));
const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text));
function Ready({ children }: { children: React.ReactNode }) { const { status } = useAuth(); return status === 'authenticated' ? children : null; }
function Probe() { const caps = useClinicCapabilities(); return <output data-dental={String(caps?.odontogram)}>Capacidades</output>; }
let generation = 0;
async function render(page: 'patient' | 'encounter' | 'treatment' | 'settings' | 'probe') {
  const route = page === 'encounter' ? `/patients/${id}/encounters/${id}` : `/patients/${id}`;
  root.render(<AuthProvider key={++generation}><Ready><MemoryRouter initialEntries={[route]}><Routes><Route path="/patients/:id" element={page === 'patient' ? <PatientDetail /> : page === 'treatment' ? <TreatmentEditor patientId={id} catalog={[]} onClose={() => {}} onSaved={() => {}} /> : page === 'settings' ? <ClinicSettings /> : <Probe />} /><Route path="/patients/:patientId/encounters/:encounterId" element={<EncounterEditor />} /></Routes></MemoryRouter></Ready></AuthProvider>);
  await tick(); await tick(); await tick();
}
async function setValue(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement;
  check(el && !el.disabled, `Campo editable: ${id}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true })); await tick();
}
async function run() {
  for (const r of ['OWNER', 'PROFESSIONAL', 'ASSISTANT']) {
    role = r; specialty = 'PEDIATRICS'; await render('patient');
    check(!button('Odontograma'), `${r}: expediente pediátrico sin odontograma`);
    check(document.body.textContent?.includes('Responsable de prueba'), `${r}: contacto de responsable en Patient compartido`);
    if (r !== 'ASSISTANT') check(button('Plan de tratamiento') && button('Recetas') && button('Consultas') && button('Documentos'), `${r}: conserva módulos clínicos compartidos`);
    await render('probe'); check(document.querySelector('output')?.dataset.dental === 'false', `${r}: capacidad deriva de clínica pediátrica, no del perfil dental`);
  }
  role = 'OWNER'; specialty = 'DENTISTRY'; await render('patient'); check(button('Odontograma'), 'Odontología mantiene pestaña de odontograma');
  await render('treatment'); check(document.body.textContent?.includes('Pieza dental'), 'Odontología mantiene captura dental de tratamiento');
  specialty = 'PEDIATRICS'; await render('treatment'); check(!document.body.textContent?.includes('Pieza dental') && !document.body.textContent?.includes('Superficies'), 'Pediatría conserva tratamiento sin selectores dentales');
  activeClinicId = otherId; await render('probe'); check(document.querySelector('output')?.dataset.dental === 'true', 'Membresía de clínica activa selecciona capacidades dentales'); activeClinicId = id;
  await render('settings'); const select = [...document.querySelectorAll('select')].find(s => s.value === 'PEDIATRICS'); check(select && !select.disabled && select.options.length === 2, 'Propietario configura dos especialidades');
  role = 'ASSISTANT'; await render('settings'); check([...document.querySelectorAll('select')].find(s => s.value === 'PEDIATRICS')?.disabled, 'Asistente no edita especialidad');
  role = 'PROFESSIONAL'; requests = []; await render('encounter');
  check(!requests.some(p => p.includes('odontogram')) && !document.body.textContent?.includes('Odontograma'), 'Consulta pediátrica no monta ni solicita odontograma');
  for (const [field, value] of Object.entries({ weightKg: '10.25', heightCm: '75.5', temperatureCelsius: '36.7', heartRate: '110', respiratoryRate: '28', oxygenSaturationPercent: '98' })) await setValue(field, value);
  button('Guardar borrador')!.click(); await tick(); await tick();
  const saved = writes.find(w => w.path === `/api/clinical-encounters/${id}`)?.body;
  check(saved?.vitalSigns?.weightKg === 10.25 && saved?.vitalSigns?.heightCm === 75.5 && saved?.vitalSigns?.temperatureCelsius === 36.7 && saved?.vitalSigns?.heartRate === 110 && saved?.vitalSigns?.respiratoryRate === 28 && saved?.vitalSigns?.oxygenSaturationPercent === 98, 'Guardar consulta envía los seis valores con talla decimal');
  check(button('Nueva receta'), 'Consulta pediátrica permite receta existente');
  const rx: any = { status: 'ISSUED', snapshot: { folio: 'RX-TEST', issuedAt: '2026-09-12T12:00:00Z', clinic: { name: 'Clínica', timeZone: 'America/Mexico_City' }, patient: { name: 'Paciente', birthDate: '2024-01-02' }, professional: { name: 'Profesional', specialty: 'PEDIATRICS', license: 'TEST', address: 'Consultorio' }, items: [], generalInstructions: '' } };
  const print = prescriptionPrintHtml(rx); check(print.includes('Pediatría') && !print.includes('PEDIATRICS') && !print.includes('YESKIRA Dental'), 'Receta imprime Pediatría legible y marca compartida');
  rx.snapshot.professional.specialty = 'DENTISTRY'; check(prescriptionPrintHtml(rx).includes('Odontología'), 'Receta conserva presentación de Odontología');
  document.body.dataset.specialtyTests = 'passed';
}
run().catch(e => { results.push(`FAIL: ${e.stack || e}`); document.body.dataset.specialtyTests = 'failed'; }).finally(() => { document.getElementById('specialty-test-results')!.textContent = results.join('\n'); });
