import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../src/core/auth/AuthProvider';
import { MainLayout } from '../../src/shared/components/Layout/MainLayout';
import { AppointmentsPage } from '../../src/features/appointments/AppointmentsPage';
import { getClinicTime, getMonthDays, getMonthlyRanges, addMonthsCivil, getCivilDate, addDaysCivil, civilDateAndTimeToIso } from '../../src/features/appointments/utils/date';
import './styles.css';

const today = getCivilDate();
const future = addDaysCivil(today, 1);
const patient = { id: 'patient', firstName: 'Mariana', lastName: 'López', secondLastName: 'García', phone: '5551234567', email: 'mariana@example.test', status: 'ACTIVE' };
const professional = { id: 'professional', role: 'PROFESSIONAL', status: 'ACTIVE', user: { id: 'user', firstName: 'Andrea', lastName: 'Martínez', email: 'andrea@example.test' } };
const statuses = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
const appointment = (id: number, day = today) => ({ id: `appointment-${id}`, patientId: patient.id, professionalMembershipId: professional.id, patient: { ...patient, firstName: ['Mariana', 'Diego', 'Lucía', 'Roberto', 'Valeria', 'Carlos'][id % 6] }, professionalMembership: professional, startAt: civilDateAndTimeToIso(day, `${String(9 + id % 8).padStart(2, '0')}:00`), endAt: civilDateAndTimeToIso(day, `${String(9 + id % 8).padStart(2, '0')}:45`), status: statuses[id % 6], reason: 'Revisión y limpieza dental', administrativeNotes: 'Paciente solicita confirmar por teléfono un día antes.', cancellationReason: 'Reprogramación solicitada por el paciente.' });
let data = Array.from({ length: 28 }, (_, id) => appointment(id, id < 6 ? today : addDaysCivil(today, (id % 20) - 10)));
let role = 'OWNER';
let failCreate = false;
let failList = false;
const requests: { path: string; body?: any; method?: string }[] = [];
window.fetch = async (input, init) => {
  const path = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ path, body, method: init?.method });
  if (path.endsWith('/auth/me')) return Response.json({ user: professional.user, activeClinicId: 'clinic', activeRole: role, memberships: [{ id: role === 'PROFESSIONAL' ? 'other' : professional.id, clinicId: 'clinic', clinicName: 'YESKIRA Dental', role }] });
  if (path.includes('/patients?')) return Response.json({ items: [patient], total: 1 });
  if (path.endsWith('/appointments/professionals')) return Response.json([professional]);
  if (path.includes('/appointments?')) {
    if (failList) { failList = false; return Response.json({}, { status: 500 }); }
    const url = new URL(path, 'http://fixture');
    const start = url.searchParams.get('startAt')!; const end = url.searchParams.get('endAt')!;
    if ((Date.parse(end) - Date.parse(start)) / 86400000 > 35) throw new Error('API range exceeds 35 days');
    return Response.json(data.filter(a => a.startAt >= start && a.startAt < end));
  }
  if (path.endsWith('/appointments') && body) {
    if (failCreate) { failCreate = false; return Response.json({ error: { code: 'APPOINTMENT_CONFLICT' } }, { status: 409 }); }
    const item = { ...appointment(30, future), ...body, id: 'created' }; data.push(item); return Response.json(item);
  }
  const item = data.find(a => path.endsWith(`/appointments/${a.id}`));
  if (item) { if (body) Object.assign(item, body); return Response.json(item); }
  return Response.json({}, { status: 404 });
};
const root = createRoot(document.getElementById('root')!);
function render(path = '/appointments') { root.render(<AuthProvider key={`${role}:${path}`}><MemoryRouter initialEntries={[path]}><Routes><Route element={<MainLayout />}><Route path="/appointments" element={<AppointmentsPage />} /></Route></Routes></MemoryRouter></AuthProvider>); }
const results: string[] = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const check = (value: unknown, label: string) => { if (!value) throw new Error(label); results.push('PASS ' + label); };
const button = (text: string, scope: ParentNode = document) => [...(scope?.querySelectorAll<HTMLButtonElement>('button') || [])].find(b => b.textContent?.trim() === text && b.getClientRects().length)!;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
async function waitFor(fn: () => unknown) { for (let n = 0; n < 150; n++) { if (fn()) return; await tick(); } throw new Error('Timed out waiting for interface'); }
async function click(text: string, scope: ParentNode = document) { const b = button(text, scope); if (!b) throw new Error(`Missing button ${text}`); b.click(); await tick(); await tick(); }
async function set(selector: string, value: string, scope: ParentNode = document) { const el = scope.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)!; if (!el) throw new Error(`Missing field ${selector}`); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); await tick(); }
async function checkpoint(name: string) { check(document.documentElement.scrollWidth <= innerWidth, `Sin overflow: ${name}`); if (new URLSearchParams(location.search).get('review') === name) { document.body.dataset.review = name; await new Promise(() => {}); } }
async function run() {
  check(getClinicTime('2026-09-10T19:00:00Z') === '13:00', 'Horario HH:mm válido para edición y calendario compacto');
  check(getMonthDays('2026-03-15').length === 42, 'Mes de seis semanas');
  check(getMonthDays('2027-02-15').length === 28, 'Mes de cuatro semanas');
  check(getMonthDays('2024-02-15').includes('2024-02-29'), 'Febrero bisiesto');
  check(addMonthsCivil('2026-01-31', 1) === '2026-02-28' && addMonthsCivil('2026-12-31', 1) === '2027-01-31', 'Navegación de mes y año');
  const ranges = getMonthlyRanges('2026-03-15');
  check(ranges.length === 2 && ranges[0].endAt === ranges[1].startAt && ranges.every(r => (Date.parse(r.endAt) - Date.parse(r.startAt)) / 86400000 <= 35), 'Rangos mensuales contiguos dentro del límite API');
  check(getCivilDate('2026-09-11T02:00:00Z') === '2026-09-10', 'Agrupación por zona de clínica');
  render(); await waitFor(() => !!button('Mes'));
  await click('Mes'); await waitFor(() => !!document.querySelector('[aria-label^="Ver día"]'));
  await checkpoint('month');
  await set('[aria-label="Filtrar por estado"]', 'CONFIRMED');
  check(!document.querySelector('button[title*="Programada"]') && !!document.querySelector('button[title*="Confirmada"]'), 'Filtro de estado en mes');
  await click('Limpiar filtros');
  const more = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(' más'))!;
  check(!!more, 'Día ocupado ofrece ver más'); more.click(); await waitFor(() => button('Día')?.getAttribute('aria-pressed') === 'true');
  await checkpoint('day');
  await click('Semana'); await waitFor(() => !!document.querySelector('button[aria-label*="cita"]'));
  check(button('Semana').getAttribute('aria-pressed') === 'true', 'Vista semanal conservada');
  await click('Mes'); await waitFor(() => !!document.querySelector('[aria-label^="Nueva cita el"]'));
  const create = document.querySelector<HTMLButtonElement>('[aria-label^="Nueva cita el"]')!; create.click(); await waitFor(() => !!dialog());
  check(!!dialog().querySelector<HTMLInputElement>('input[type="date"]')?.value, 'Crear desde día preselecciona fecha');
  await set('input[type="text"]', 'Mariana', dialog()); await waitFor(() => !!button('Mariana López García', dialog())); await click('Mariana López García', dialog());
  await set('input[type="date"]', future, dialog()); await set('input[type="time"]', '10:00', dialog()); await click('45 min', dialog());
  await set('select', 'professional', dialog());
  check(dialog().textContent?.includes('45 min en total'), 'Duración rápida calcula término');
  await checkpoint('form');
  failCreate = true; await click('Guardar cita', dialog()); await waitFor(() => !!dialog()?.querySelector('[role="alert"]'));
  check(dialog().textContent?.includes('ya tiene una cita') && dialog().textContent?.includes('Mariana'), 'Conflicto conserva captura y muestra error');
  await click('Guardar cita', dialog()); await waitFor(() => !dialog());
  const payload = requests.find(r => r.body?.patientId)?.body;
  check(payload.patientId === 'patient' && payload.startAt === civilDateAndTimeToIso(future, '10:00') && payload.endAt === civilDateAndTimeToIso(future, '10:45') && !payload.clinicId, 'Alta usa contrato y horario clínico existentes');
  render('/appointments?appointment=appointment-0'); await waitFor(() => !!button('Editar', dialog()));
  check(!!button('Iniciar atención', dialog()), 'Responsable conserva acción clínica');
  await checkpoint('detail');
  await click('Editar', dialog()); await waitFor(() => document.querySelectorAll('[role="dialog"]').length === 2);
  const edit = document.querySelectorAll<HTMLElement>('[role="dialog"]')[1];
  check(edit.textContent?.includes('Mariana López García') && !button('Cambiar', edit), 'Edición conserva paciente bloqueado');
  check(edit.querySelector<HTMLInputElement>('input[type="time"]')?.value === '09:00', 'Edición precarga hora válida');
  await click('Cancelar', edit);
  role = 'PROFESSIONAL'; render('/appointments?appointment=appointment-1'); await waitFor(() => dialog()?.textContent?.includes('Diego'));
  check(!button('Editar', dialog()) && !button('Iniciar atención', dialog()) && !button('Cancelar cita', dialog()), 'Profesional ajeno no obtiene acciones');
  role = 'ASSISTANT'; render('/appointments?appointment=appointment-2'); await waitFor(() => dialog()?.textContent?.includes('Lucía'));
  check(!button('Iniciar atención', dialog()) && !button('Cancelar cita', dialog()), 'Asistente no inicia atención ni cancela cita en curso');
  role = 'OWNER'; render('/appointments?appointment=appointment-4'); await waitFor(() => dialog()?.textContent?.includes('Motivo de cancelación'));
  check(!button('Editar', dialog()) && !button('Cancelar cita', dialog()), 'Cancelada muestra motivo sin acciones inválidas');
  render('/appointments?new=1'); await waitFor(() => !!button('Guardar cita', dialog())); check(!!dialog(), 'Enlace de nueva cita conservado'); await click('Cancelar', dialog());
  failList = true; await click('Mes'); await waitFor(() => !!button('Reintentar')); await click('Reintentar'); await waitFor(() => !!document.querySelector('[aria-label^="Ver día"]')); check(true, 'Error de agenda permite reintento');
  document.body.dataset.appointmentTests = 'passed';
}
run().catch(e => { results.push('FAIL ' + e.message); document.body.dataset.appointmentTests = 'failed'; }).finally(() => { document.getElementById('appointment-test-results')!.textContent = results.join('\n'); });
